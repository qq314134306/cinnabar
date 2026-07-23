/**
 * [INPUT]: Recent local Future Report purchases and authoritative PayPal order reads
 * [OUTPUT]: Stable reconciliation counters plus monotonic database repairs
 * [POS]: Server-only bounded reconciliation worker for the Vercel Cron endpoint
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import { expectedOrder } from './_future-report'
import {
  PayPalApiError,
  type PayPalServerClient,
  type VerifiedPayPalCaptureBinding,
} from './_paypal'
import type {
  PayPalPaymentStore,
  PayPalReconciliationCursor,
} from './_paypal-webhook'

const DEFAULT_LOOKBACK_DAYS = 31
const DEFAULT_PAGE_SIZE = 25
const DEFAULT_MAX_PAGES = 4

type ReconciliationPayPalClient = Pick<
  PayPalServerClient,
  'retrieveOrderPaymentState'
>

export interface PayPalReconciliationCounts {
  scanned: number
  updated: number
  unchanged: number
  deferred: number
  failed: number
  pages: number
  hasMore: boolean
  rateLimited: number
  backoff: number
}

interface ReconciliationOptions {
  now?: Date
  lookbackDays?: number
  pageSize?: number
  maxPages?: number
}

export async function reconcileRecentPayPalPurchases(
  client: ReconciliationPayPalClient,
  store: PayPalPaymentStore,
  options: ReconciliationOptions = {},
): Promise<PayPalReconciliationCounts> {
  const now = options.now ?? new Date()
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const since = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString()
  const verifiedAt = now.toISOString()
  const counts: PayPalReconciliationCounts = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    deferred: 0,
    failed: 0,
    pages: 0,
    hasMore: false,
    rateLimited: 0,
    backoff: 0,
  }

  let cursor = await store.getReconciliationCursor()
  if (
    cursor.nextRetryAt &&
    new Date(cursor.nextRetryAt).getTime() > now.getTime()
  ) {
    counts.backoff = 1
    return counts
  }

  for (let page = 0; page < maxPages; page += 1) {
    const result = await store.listRecentPurchases(since, cursor, pageSize)
    counts.pages += 1
    counts.hasMore = result.hasMore
    if (result.purchases.length === 0) {
      await store.completeReconciliationCycle()
      counts.hasMore = false
      break
    }

    for (const purchase of result.purchases) {
      counts.scanned += 1
      if (!purchase.paypal_order_id) {
        counts.deferred += 1
      } else {
        try {
          const state = await client.retrieveOrderPaymentState(
            purchase.paypal_order_id,
            expectedOrder(purchase),
          )
          if (!state) {
            counts.deferred += 1
          } else {
            const evidence: VerifiedPayPalCaptureBinding = {
              captureId: state.captureId,
              orderId: state.orderId,
              purchaseId: state.purchaseId,
            }
            const outcome = await store.applyState(
              purchase,
              state.status,
              evidence,
              verifiedAt,
            )
            if (outcome === 'updated') counts.updated += 1
            else if (
              outcome === 'unchanged' ||
              outcome === 'blocked_terminal'
            ) counts.unchanged += 1
            else counts.deferred += 1
          }
        } catch (error) {
          counts.failed += 1
          counts.hasMore = true
          if (
            error instanceof PayPalApiError &&
            error.code === 'PAYPAL_RATE_LIMITED'
          ) {
            counts.rateLimited += 1
            counts.backoff = 1
            const retryAfterSeconds = error.retryAfterSeconds ?? 60
            await store.deferReconciliation(
              new Date(now.getTime() + retryAfterSeconds * 1_000).toISOString(),
            )
          }
          return counts
        }
      }

      await store.advanceReconciliationCursor(purchase.created_at, purchase.id)
      cursor = {
        createdAt: purchase.created_at,
        purchaseId: purchase.id,
        nextRetryAt: null,
      } satisfies PayPalReconciliationCursor
    }

    if (!result.hasMore) {
      await store.completeReconciliationCycle()
      counts.hasMore = false
      break
    }
  }

  return counts
}
