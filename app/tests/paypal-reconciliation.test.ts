import { describe, expect, it, vi } from 'vitest'
import { reconcileRecentPayPalPurchases } from '../api/_paypal-reconciliation'
import { PayPalApiError } from '../api/_paypal'
import { createPayPalReconciliationHandler } from '../api/cron/paypal-reconciliation'

function purchase(id: string, orderId: string) {
  return {
    id,
    user_id: '10000000-0000-4000-8000-000000000001',
    tier: '1-year' as const,
    amount_minor: 990,
    currency: 'USD',
    client_attempt_id: '30000000-0000-4000-8000-000000000001',
    paypal_order_id: orderId,
    paypal_capture_id: null,
    payment_status: 'capture_pending',
    payment_completed_at: null,
    generation_input: null,
    generation_status: 'not_started',
    generation_started_at: null,
    generated_report: null,
    generation_completed_at: null,
    created_at: '2026-07-22T00:00:00Z',
    chart_fingerprint: null,
    generation_attempt_count: 0,
    generation_next_retry_at: null,
  }
}

describe('PayPal reconciliation', () => {
  it('paginates recent local purchases and repairs only authoritative PayPal states', async () => {
    const first = purchase('20000000-0000-4000-8000-000000000001', 'ORDER1')
    const second = purchase('20000000-0000-4000-8000-000000000002', 'ORDER2')
    const store = {
      claimEvent: vi.fn(),
      finishEvent: vi.fn(),
      findPurchase: vi.fn(),
      applyState: vi.fn()
        .mockResolvedValueOnce('updated')
        .mockResolvedValueOnce('unchanged'),
      listRecentPurchases: vi.fn()
        .mockResolvedValueOnce({ purchases: [first], hasMore: true })
        .mockResolvedValueOnce({ purchases: [second], hasMore: false }),
      getReconciliationCursor: vi.fn().mockResolvedValue({
        createdAt: null,
        purchaseId: null,
        nextRetryAt: null,
      }),
      advanceReconciliationCursor: vi.fn().mockResolvedValue(undefined),
      completeReconciliationCycle: vi.fn().mockResolvedValue(undefined),
      deferReconciliation: vi.fn(),
    }
    const client = {
      retrieveOrderPaymentState: vi.fn()
        .mockResolvedValueOnce({
          captureId: 'CAPTURE1',
          orderId: 'ORDER1',
          purchaseId: first.id,
          status: 'completed',
        })
        .mockResolvedValueOnce({
          captureId: 'CAPTURE2',
          orderId: 'ORDER2',
          purchaseId: second.id,
          status: 'refunded',
        }),
    }

    const counts = await reconcileRecentPayPalPurchases(client, store, {
      now: new Date('2026-07-23T12:00:00Z'),
      pageSize: 1,
      maxPages: 4,
    })

    expect(counts).toEqual({
      scanned: 2,
      updated: 1,
      unchanged: 1,
      deferred: 0,
      failed: 0,
      pages: 2,
      hasMore: false,
      rateLimited: 0,
      backoff: 0,
    })
    expect(store.listRecentPurchases).toHaveBeenNthCalledWith(
      1,
      '2026-06-22T12:00:00.000Z',
      { createdAt: null, purchaseId: null, nextRetryAt: null },
      1,
    )
    expect(store.listRecentPurchases).toHaveBeenNthCalledWith(
      2,
      '2026-06-22T12:00:00.000Z',
      {
        createdAt: first.created_at,
        purchaseId: first.id,
        nextRetryAt: null,
      },
      1,
    )
    expect(store.applyState).toHaveBeenNthCalledWith(
      1,
      first,
      'completed',
      {
        captureId: 'CAPTURE1',
        orderId: 'ORDER1',
        purchaseId: first.id,
      },
      '2026-07-23T12:00:00.000Z',
    )
  })

  it('persists a keyset cursor so a backlog larger than 100 continues next run', async () => {
    const backlog = Array.from({ length: 125 }, (_, index) => purchase(
      `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      `ORDER${index + 1}`,
    ))
    let cursor = {
      createdAt: null as string | null,
      purchaseId: null as string | null,
      nextRetryAt: null as string | null,
    }
    const store = {
      claimEvent: vi.fn(),
      finishEvent: vi.fn(),
      findPurchase: vi.fn(),
      applyState: vi.fn().mockResolvedValue('unchanged'),
      getReconciliationCursor: vi.fn(async () => ({ ...cursor })),
      listRecentPurchases: vi.fn(async (
        _since: string,
        current: typeof cursor,
        pageSize: number,
      ) => {
        const start = current.purchaseId
          ? backlog.findIndex((item) => item.id === current.purchaseId) + 1
          : 0
        const purchases = backlog.slice(start, start + pageSize)
        return { purchases, hasMore: purchases.length === pageSize }
      }),
      advanceReconciliationCursor: vi.fn(async (
        createdAt: string,
        purchaseId: string,
      ) => {
        cursor = { createdAt, purchaseId, nextRetryAt: null }
      }),
      completeReconciliationCycle: vi.fn(async () => {
        cursor = { createdAt: null, purchaseId: null, nextRetryAt: null }
      }),
      deferReconciliation: vi.fn(),
    }
    const client = {
      retrieveOrderPaymentState: vi.fn(async (
        orderId: string,
        expected: { purchaseId: string },
      ) => ({
        captureId: `CAPTURE-${orderId}`,
        orderId,
        purchaseId: expected.purchaseId,
        status: 'completed' as const,
      })),
    }

    const firstRun = await reconcileRecentPayPalPurchases(client, store, {
      now: new Date('2026-07-23T12:00:00Z'),
      pageSize: 25,
      maxPages: 4,
    })
    expect(firstRun.scanned).toBe(100)
    expect(firstRun.hasMore).toBe(true)
    expect(cursor.purchaseId).toBe(backlog[99].id)

    const secondRun = await reconcileRecentPayPalPurchases(client, store, {
      now: new Date('2026-07-23T12:05:00Z'),
      pageSize: 25,
      maxPages: 4,
    })
    expect(secondRun.scanned).toBe(25)
    expect(client.retrieveOrderPaymentState).toHaveBeenCalledTimes(125)
    expect(cursor.purchaseId).toBeNull()
    expect(store.completeReconciliationCycle).toHaveBeenCalledTimes(1)
  })

  it('persists PayPal 429 backoff without advancing past the failed purchase', async () => {
    const pending = purchase('20000000-0000-4000-8000-000000000099', 'ORDER99')
    let cursor = {
      createdAt: null as string | null,
      purchaseId: null as string | null,
      nextRetryAt: null as string | null,
    }
    const store = {
      claimEvent: vi.fn(),
      finishEvent: vi.fn(),
      findPurchase: vi.fn(),
      applyState: vi.fn(),
      getReconciliationCursor: vi.fn(async () => ({ ...cursor })),
      listRecentPurchases: vi.fn().mockResolvedValue({
        purchases: [pending],
        hasMore: true,
      }),
      advanceReconciliationCursor: vi.fn(),
      completeReconciliationCycle: vi.fn(),
      deferReconciliation: vi.fn(async (nextRetryAt: string) => {
        cursor = { ...cursor, nextRetryAt }
      }),
    }
    const client = {
      retrieveOrderPaymentState: vi.fn().mockRejectedValue(
        new PayPalApiError(
          'rate limited',
          429,
          'PAYPAL_RATE_LIMITED',
          120,
        ),
      ),
    }

    const firstRun = await reconcileRecentPayPalPurchases(client, store, {
      now: new Date('2026-07-23T12:00:00Z'),
    })
    expect(firstRun).toMatchObject({
      scanned: 1,
      failed: 1,
      rateLimited: 1,
      backoff: 1,
      hasMore: true,
    })
    expect(store.advanceReconciliationCursor).not.toHaveBeenCalled()
    expect(store.deferReconciliation).toHaveBeenCalledWith(
      '2026-07-23T12:02:00.000Z',
    )

    const duringBackoff = await reconcileRecentPayPalPurchases(client, store, {
      now: new Date('2026-07-23T12:01:00Z'),
    })
    expect(duringBackoff).toMatchObject({
      scanned: 0,
      pages: 0,
      backoff: 1,
    })
    expect(client.retrieveOrderPaymentState).toHaveBeenCalledTimes(1)
  })

  it('requires the independent CRON_SECRET and returns only stable aggregate counts', async () => {
    const counts = {
      scanned: 2,
      updated: 1,
      unchanged: 0,
      deferred: 1,
      failed: 0,
      pages: 1,
      hasMore: false,
      rateLimited: 0,
      backoff: 0,
    }
    const reconcile = vi.fn().mockResolvedValue(counts)
    const handler = createPayPalReconciliationHandler({
      env: { CRON_SECRET: 'a-separate-strong-cron-secret' } as NodeJS.ProcessEnv,
      getClient: () => ({ retrieveOrderPaymentState: vi.fn() }),
      getStore: () => ({
        claimEvent: vi.fn(),
        finishEvent: vi.fn(),
        findPurchase: vi.fn(),
        applyState: vi.fn(),
        listRecentPurchases: vi.fn(),
        getReconciliationCursor: vi.fn(),
        advanceReconciliationCursor: vi.fn(),
        completeReconciliationCycle: vi.fn(),
        deferReconciliation: vi.fn(),
      }),
      reconcile,
    })

    const unauthorized = await handler(new Request(
      'https://example.test/api/cron/paypal-reconciliation',
      { method: 'GET', headers: { Authorization: 'Bearer wrong-secret' } },
    ))
    expect(unauthorized.status).toBe(401)
    expect(reconcile).not.toHaveBeenCalled()

    const response = await handler(new Request(
      'https://example.test/api/cron/paypal-reconciliation',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer a-separate-strong-cron-secret' },
      },
    ))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ reconciliation: counts })
    expect(JSON.stringify(body)).not.toContain('ORDER')
  })
})
