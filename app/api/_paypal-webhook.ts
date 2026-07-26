/**
 * [INPUT]: Signature-verified PayPal event identifiers and authoritative PayPal API reads
 * [OUTPUT]: Idempotent event outcomes and monotonic Future Report payment-state updates
 * [POS]: Server-only webhook/reconciliation orchestration; never trusts event resource fields as state
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FUTURE_REPORT_TABLE,
  type FutureReportPurchaseRow,
  expectedOrder,
} from './_future-report'
import type {
  PayPalServerClient,
  VerifiedPayPalCaptureBinding,
  VerifiedPayPalPaymentStatus,
} from './_paypal'
import { getSupabaseAdmin } from './_supabase-admin'

export const PAYPAL_CAPTURE_EVENT_TYPES = new Set([
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'PAYMENT.CAPTURE.DECLINED',
] as const)

export const PAYPAL_DISPUTE_EVENT_TYPES = new Set([
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.UPDATED',
  'CUSTOMER.DISPUTE.RESOLVED',
] as const)

export type PayPalAppliedStatus = VerifiedPayPalPaymentStatus | 'disputed'
export type PayPalApplyOutcome =
  | 'updated'
  | 'unchanged'
  | 'blocked_terminal'
  | 'deferred'
  | 'not_found'
export type WebhookDeliveryStatus = 'processed' | 'ignored' | 'failed'

export interface ParsedPayPalWebhookEvent {
  id: string
  eventType: string
  resourceId: string | null
}

export interface PayPalWebhookOutcome {
  deliveryStatus: Exclude<WebhookDeliveryStatus, 'failed'>
  outcome: string
  resourceId: string | null
}

export interface RecentPurchasePage {
  purchases: FutureReportPurchaseRow[]
  hasMore: boolean
}

export interface PayPalReconciliationCursor {
  createdAt: string | null
  purchaseId: string | null
  nextRetryAt: string | null
}

export interface PayPalPaymentStore {
  claimEvent(eventId: string, eventType: string): Promise<boolean>
  finishEvent(
    eventId: string,
    deliveryStatus: WebhookDeliveryStatus,
    outcome: string,
    resourceId: string | null,
  ): Promise<void>
  findPurchase(purchaseId: string): Promise<FutureReportPurchaseRow | null>
  applyState(
    purchase: FutureReportPurchaseRow,
    status: PayPalAppliedStatus,
    evidence: VerifiedPayPalCaptureBinding,
    verifiedAt: string,
    disputeId?: string,
  ): Promise<PayPalApplyOutcome>
  listRecentPurchases(
    since: string,
    cursor: PayPalReconciliationCursor,
    pageSize: number,
  ): Promise<RecentPurchasePage>
  getReconciliationCursor(): Promise<PayPalReconciliationCursor>
  advanceReconciliationCursor(createdAt: string, purchaseId: string): Promise<void>
  completeReconciliationCycle(): Promise<void>
  deferReconciliation(nextRetryAt: string): Promise<void>
}

type PayPalReadClient = Pick<
  PayPalServerClient,
  'retrieveCaptureBinding' | 'retrievePaymentState' | 'retrieveDisputeCaptureIds'
>

function assertStoreResult(error: { message?: string } | null): void {
  if (error) throw new Error('PayPal persistence operation failed.')
}

export class SupabasePayPalPaymentStore implements PayPalPaymentStore {
  private readonly admin: SupabaseClient

  constructor(admin: SupabaseClient = getSupabaseAdmin()) {
    this.admin = admin
  }

  async claimEvent(eventId: string, eventType: string): Promise<boolean> {
    const result = await this.admin.rpc('claim_paypal_webhook_event', {
      p_event_id: eventId,
      p_event_type: eventType,
    })
    assertStoreResult(result.error)
    return result.data === true
  }

  async finishEvent(
    eventId: string,
    deliveryStatus: WebhookDeliveryStatus,
    outcome: string,
    resourceId: string | null,
  ): Promise<void> {
    const result = await this.admin.rpc('finish_paypal_webhook_event', {
      p_event_id: eventId,
      p_delivery_status: deliveryStatus,
      p_processing_outcome: outcome,
      p_resource_id: resourceId,
    })
    assertStoreResult(result.error)
  }

  async findPurchase(purchaseId: string): Promise<FutureReportPurchaseRow | null> {
    const result = await this.admin
      .from(FUTURE_REPORT_TABLE)
      .select('*')
      .eq('id', purchaseId)
      .maybeSingle()
    assertStoreResult(result.error)
    return result.data as FutureReportPurchaseRow | null
  }

  async applyState(
    purchase: FutureReportPurchaseRow,
    status: PayPalAppliedStatus,
    evidence: VerifiedPayPalCaptureBinding,
    verifiedAt: string,
    disputeId?: string,
  ): Promise<PayPalApplyOutcome> {
    const result = await this.admin.rpc('apply_future_report_paypal_state', {
      p_purchase_id: purchase.id,
      p_target_status: status,
      p_paypal_order_id: evidence.orderId,
      p_paypal_capture_id: evidence.captureId,
      p_verified_at: verifiedAt,
      p_paypal_dispute_id: disputeId ?? null,
    })
    assertStoreResult(result.error)
    if (
      result.data !== 'updated' &&
      result.data !== 'unchanged' &&
      result.data !== 'blocked_terminal' &&
      result.data !== 'deferred' &&
      result.data !== 'not_found'
    ) {
      throw new Error('PayPal persistence returned an invalid outcome.')
    }
    return result.data
  }

  async listRecentPurchases(
    since: string,
    cursor: PayPalReconciliationCursor,
    pageSize: number,
  ): Promise<RecentPurchasePage> {
    let query = this.admin
      .from(FUTURE_REPORT_TABLE)
      .select('*')
      .gte('created_at', since)
      .not('paypal_order_id', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize)
    if (cursor.createdAt && cursor.purchaseId) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.purchaseId})`,
      )
    }
    const result = await query
    assertStoreResult(result.error)
    const purchases = (result.data ?? []) as FutureReportPurchaseRow[]
    return { purchases, hasMore: purchases.length === pageSize }
  }

  async getReconciliationCursor(): Promise<PayPalReconciliationCursor> {
    const result = await this.admin
      .rpc('read_paypal_reconciliation_state')
      .single()
    assertStoreResult(result.error)
    const row = result.data as {
      cursor_created_at?: unknown
      cursor_purchase_id?: unknown
      next_retry_at?: unknown
    }
    return {
      createdAt: typeof row.cursor_created_at === 'string'
        ? row.cursor_created_at
        : null,
      purchaseId: typeof row.cursor_purchase_id === 'string'
        ? row.cursor_purchase_id
        : null,
      nextRetryAt: typeof row.next_retry_at === 'string'
        ? row.next_retry_at
        : null,
    }
  }

  async advanceReconciliationCursor(
    createdAt: string,
    purchaseId: string,
  ): Promise<void> {
    const result = await this.admin.rpc('advance_paypal_reconciliation_cursor', {
      p_cursor_created_at: createdAt,
      p_cursor_purchase_id: purchaseId,
      p_cycle_completed: false,
    })
    assertStoreResult(result.error)
  }

  async completeReconciliationCycle(): Promise<void> {
    const result = await this.admin.rpc('advance_paypal_reconciliation_cursor', {
      p_cursor_created_at: null,
      p_cursor_purchase_id: null,
      p_cycle_completed: true,
    })
    assertStoreResult(result.error)
  }

  async deferReconciliation(nextRetryAt: string): Promise<void> {
    const result = await this.admin.rpc('defer_paypal_reconciliation', {
      p_next_retry_at: nextRetryAt,
    })
    assertStoreResult(result.error)
  }
}

export function parseVerifiedWebhookEvent(
  webhookEvent: Record<string, unknown>,
): ParsedPayPalWebhookEvent | null {
  const id = webhookEvent.id
  const eventType = webhookEvent.event_type
  if (
    typeof id !== 'string' ||
    !id ||
    id.length > 255 ||
    typeof eventType !== 'string' ||
    !eventType ||
    eventType.length > 127
  ) {
    return null
  }
  const resource = webhookEvent.resource
  const resourceRecord = resource && typeof resource === 'object'
    ? resource as Record<string, unknown>
    : null
  const resourceId = eventType.startsWith('CUSTOMER.DISPUTE.')
    ? resourceRecord?.dispute_id
    : resourceRecord?.id
  return {
    id,
    eventType,
    resourceId: typeof resourceId === 'string' && resourceId.length <= 255
      ? resourceId
      : null,
  }
}

async function resolveLocalPurchase(
  client: PayPalReadClient,
  store: PayPalPaymentStore,
  captureId: string,
): Promise<{
  evidence: VerifiedPayPalCaptureBinding
  purchase: FutureReportPurchaseRow
} | null> {
  const evidence = await client.retrieveCaptureBinding(captureId)
  const purchase = await store.findPurchase(evidence.purchaseId)
  if (!purchase || purchase.paypal_order_id !== evidence.orderId) return null
  return { evidence, purchase }
}

function expectedCaptureTarget(eventType: string): PayPalAppliedStatus | null {
  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      return 'completed'
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED':
      return 'refunded'
    case 'PAYMENT.CAPTURE.DECLINED':
      return 'denied'
    default:
      return null
  }
}

export class RetryablePayPalWebhookError extends Error {
  readonly outcome: string

  constructor(outcome: string) {
    super(outcome)
    this.outcome = outcome
  }
}

export async function processVerifiedPayPalEvent(
  event: ParsedPayPalWebhookEvent,
  client: PayPalReadClient,
  store: PayPalPaymentStore,
  verifiedAt: string,
): Promise<PayPalWebhookOutcome> {
  const isCaptureEvent = PAYPAL_CAPTURE_EVENT_TYPES.has(
    event.eventType as never,
  )
  const isDisputeEvent = PAYPAL_DISPUTE_EVENT_TYPES.has(
    event.eventType as never,
  )
  if (!isCaptureEvent && !isDisputeEvent) {
    return {
      deliveryStatus: 'ignored',
      outcome: 'unknown_event_type',
      resourceId: event.resourceId,
    }
  }
  if (!event.resourceId) {
    return {
      deliveryStatus: 'ignored',
      outcome: 'missing_resource_id',
      resourceId: null,
    }
  }

  if (isCaptureEvent) {
    const resolved = await resolveLocalPurchase(
      client,
      store,
      event.resourceId,
    )
    if (!resolved) {
      throw new RetryablePayPalWebhookError('purchase_not_found')
    }
    const current = await client.retrievePaymentState(
      resolved.evidence.orderId,
      expectedOrder(resolved.purchase),
      resolved.evidence.captureId,
    )
    const target = expectedCaptureTarget(event.eventType)
    if (current.status !== target) {
      throw new RetryablePayPalWebhookError('authoritative_state_mismatch')
    }
    const outcome = await store.applyState(
      resolved.purchase,
      current.status,
      resolved.evidence,
      verifiedAt,
    )
    if (outcome === 'deferred' || outcome === 'not_found') {
      throw new RetryablePayPalWebhookError(`payment_${outcome}`)
    }
    return {
      deliveryStatus: 'processed',
      outcome: `payment_${outcome}`,
      resourceId: event.resourceId,
    }
  }

  const captureIds = await client.retrieveDisputeCaptureIds(event.resourceId)
  let matchedPurchases = 0
  let updatedPurchases = 0
  for (const captureId of captureIds) {
    const resolved = await resolveLocalPurchase(client, store, captureId)
    if (!resolved) continue
    await client.retrievePaymentState(
      resolved.evidence.orderId,
      expectedOrder(resolved.purchase),
      resolved.evidence.captureId,
    )
    matchedPurchases += 1
    const outcome = await store.applyState(
      resolved.purchase,
      'disputed',
      resolved.evidence,
      verifiedAt,
      event.resourceId,
    )
    if (outcome === 'deferred' || outcome === 'not_found') {
      throw new RetryablePayPalWebhookError(`dispute_${outcome}`)
    }
    if (outcome === 'updated') updatedPurchases += 1
  }
  if (matchedPurchases === 0) {
    throw new RetryablePayPalWebhookError('purchase_not_found')
  }
  return {
    deliveryStatus: 'processed',
    outcome: updatedPurchases > 0 ? 'dispute_updated' : 'dispute_unchanged',
    resourceId: event.resourceId,
  }
}
