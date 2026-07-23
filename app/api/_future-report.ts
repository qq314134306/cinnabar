/**
 * [INPUT]: Trusted Future Report purchase rows
 * [OUTPUT]: Checkout validation and owner-safe API representations
 * [POS]: Shared server-only domain helpers for Future Report payment/generation APIs
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { FutureReportTier } from './_paypal'
import type { GenerationInput } from './_future-report-chart'
import { readAuthMode } from './_auth'
import { HttpError } from './_require-user'

export const FUTURE_REPORT_TABLE = 'future_report_purchases'

export function requireFutureReportPaymentsEnabled(): void {
  if (process.env.ENABLE_FUTURE_REPORT_PAYMENTS !== 'true') {
    throw new HttpError(
      'Future Report payments are disabled.',
      503,
      'PAYMENTS_DISABLED',
    )
  }
  if (readAuthMode() !== 'opaque') {
    throw new HttpError(
      'Future Report payments require secure server sessions.',
      503,
      'SECURE_AUTH_REQUIRED',
    )
  }
}

export interface FutureReportPurchaseRow {
  id: string
  user_id: string | null
  tier: FutureReportTier
  amount_minor: number
  currency: string
  client_attempt_id: string
  paypal_order_id: string | null
  paypal_capture_id: string | null
  payment_status: string
  payment_completed_at: string | null
  generation_input: GenerationInput | null
  generation_status: string
  generation_started_at: string | null
  generated_report: string | null
  generation_completed_at: string | null
  created_at: string
  chart_fingerprint: string | null
  generation_attempt_count: number
  generation_next_retry_at: string | null
}

const ATTEMPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseAttemptId(value: unknown): string {
  if (typeof value !== 'string' || !ATTEMPT_ID_RE.test(value)) {
    throw new HttpError('A valid checkout attempt ID is required.', 400)
  }
  return value
}

export function parseExactRequestObject(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('Request body must be a JSON object.', 400, 'INVALID_REQUEST')
  }
  const body = value as Record<string, unknown>
  const actualKeys = Object.keys(body)
  if (
    actualKeys.length !== keys.length
    || actualKeys.some((key) => !keys.includes(key))
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(body, key))
  ) {
    throw new HttpError(
      'Request body contains unsupported or missing fields.',
      400,
      'INVALID_REQUEST',
    )
  }
  return body
}

export function publicPurchase(row: FutureReportPurchaseRow): Record<string, unknown> {
  return {
    purchaseId: row.id,
    tier: row.tier,
    amountMinor: row.amount_minor,
    currency: row.currency,
    orderId: row.paypal_order_id,
    paymentStatus: row.payment_status,
    generationStatus: row.generation_status,
    report: row.generated_report,
    chartFingerprint: row.chart_fingerprint,
  }
}

export function expectedOrder(row: FutureReportPurchaseRow) {
  return {
    purchaseId: row.id,
    amountMinor: row.amount_minor,
    currency: row.currency,
  }
}
