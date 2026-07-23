import { describe, expect, it, vi } from 'vitest'
import { createPayPalWebhookHandler } from '../api/paypal-webhook'

const WEBHOOK_HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
  'paypal-transmission-id': 'transmission-1',
  'paypal-transmission-sig': 'signature-1',
  'paypal-transmission-time': '2026-07-23T12:00:00Z',
}

function requestFor(event: Record<string, unknown>): Request {
  return new Request('https://example.test/api/paypal-webhook', {
    method: 'POST',
    headers: WEBHOOK_HEADERS,
    body: JSON.stringify(event),
  })
}

function purchase() {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    user_id: '10000000-0000-4000-8000-000000000001',
    tier: '1-year' as const,
    amount_minor: 990,
    currency: 'USD',
    client_attempt_id: '30000000-0000-4000-8000-000000000001',
    paypal_order_id: 'ORDER123',
    paypal_capture_id: null,
    payment_status: 'capture_pending',
    payment_completed_at: null,
    generation_input: null,
    generation_status: 'not_started',
    generation_started_at: null,
    generated_report: null,
    generation_completed_at: null,
    created_at: '2026-07-23T11:00:00Z',
    chart_fingerprint: null,
    generation_attempt_count: 0,
    generation_next_retry_at: null,
  }
}

function storeMocks(overrides: Record<string, unknown> = {}) {
  return {
    claimEvent: vi.fn().mockResolvedValue(true),
    finishEvent: vi.fn().mockResolvedValue(undefined),
    findPurchase: vi.fn().mockResolvedValue(purchase()),
    applyState: vi.fn().mockResolvedValue('updated'),
    listRecentPurchases: vi.fn(),
    getReconciliationCursor: vi.fn(),
    advanceReconciliationCursor: vi.fn(),
    completeReconciliationCycle: vi.fn(),
    deferReconciliation: vi.fn(),
    ...overrides,
  }
}

function clientMocks(overrides: Record<string, unknown> = {}) {
  return {
    verifyWebhookSignature: vi.fn().mockResolvedValue(true),
    retrieveCaptureBinding: vi.fn().mockResolvedValue({
      captureId: 'CAPTURE123',
      orderId: 'ORDER123',
      purchaseId: purchase().id,
    }),
    retrievePaymentState: vi.fn().mockResolvedValue({
      captureId: 'CAPTURE123',
      orderId: 'ORDER123',
      purchaseId: purchase().id,
      status: 'completed',
    }),
    retrieveDisputeCaptureIds: vi.fn(),
    ...overrides,
  }
}

const handlerEnv = {
  PAYPAL_WEBHOOK_ID: 'WEBHOOK123',
} as NodeJS.ProcessEnv

describe('PayPal webhook handler', () => {
  it('verifies original headers/event then re-fetches capture and order before completing', async () => {
    const store = storeMocks()
    const client = clientMocks()
    const event = {
      id: 'WH-EVENT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE123',
        status: 'COMPLETED',
        amount: { value: '0.01', currency_code: 'EUR' },
      },
    }
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
      now: () => new Date('2026-07-23T12:00:01Z'),
    })

    const response = await handler(requestFor(event))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
    expect(client.verifyWebhookSignature).toHaveBeenCalledWith(
      expect.any(Headers),
      event,
      'WEBHOOK123',
    )
    expect(client.retrieveCaptureBinding).toHaveBeenCalledWith('CAPTURE123')
    expect(client.retrievePaymentState).toHaveBeenCalledWith(
      'ORDER123',
      {
        purchaseId: purchase().id,
        amountMinor: 990,
        currency: 'USD',
      },
      'CAPTURE123',
    )
    expect(store.applyState).toHaveBeenCalledWith(
      expect.objectContaining({ id: purchase().id }),
      'completed',
      {
        captureId: 'CAPTURE123',
        orderId: 'ORDER123',
        purchaseId: purchase().id,
      },
      '2026-07-23T12:00:01.000Z',
    )
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-EVENT-1',
      'processed',
      'payment_updated',
      'CAPTURE123',
    )
  })

  it('records unknown signed events and safely acknowledges them', async () => {
    const store = storeMocks()
    const client = clientMocks()
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-EVENT-UNKNOWN',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: 'UNTRUSTED-ORDER' },
    }))

    expect(response.status).toBe(200)
    expect(client.retrieveCaptureBinding).not.toHaveBeenCalled()
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-EVENT-UNKNOWN',
      'ignored',
      'unknown_event_type',
      'UNTRUSTED-ORDER',
    )
  })

  it('deduplicates claimed event IDs before any PayPal resource query', async () => {
    const store = storeMocks({
      claimEvent: vi.fn().mockResolvedValue(false),
    })
    const client = clientMocks()
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-EVENT-DUPLICATE',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE123' },
    }))

    expect(response.status).toBe(200)
    expect(client.retrieveCaptureBinding).not.toHaveBeenCalled()
    expect(store.finishEvent).not.toHaveBeenCalled()
  })

  it('keeps an out-of-order authoritative mismatch retryable', async () => {
    const store = storeMocks()
    const client = clientMocks({
      retrievePaymentState: vi.fn().mockResolvedValue({
        captureId: 'CAPTURE123',
        orderId: 'ORDER123',
        purchaseId: purchase().id,
        status: 'pending',
      }),
    })
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-EVENT-EARLY',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE123', status: 'COMPLETED' },
    }))

    expect(response.status).toBe(500)
    expect(store.applyState).not.toHaveBeenCalled()
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-EVENT-EARLY',
      'failed',
      'authoritative_state_mismatch',
      'CAPTURE123',
    )
  })

  it('uses the official dispute_id field and lays a pre-completion dispute tombstone', async () => {
    const store = storeMocks()
    const client = clientMocks({
      retrieveDisputeCaptureIds: vi.fn().mockResolvedValue(['CAPTURE123']),
    })
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
      now: () => new Date('2026-07-23T12:00:01Z'),
    })

    const response = await handler(requestFor({
      id: 'WH-DISPUTE-1',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: {
        dispute_id: 'PP-D-123',
        id: 'WRONG-GENERIC-ID',
        disputed_transactions: [{ seller_transaction_id: 'UNTRUSTED' }],
      },
    }))

    expect(response.status).toBe(200)
    expect(client.retrieveDisputeCaptureIds).toHaveBeenCalledWith('PP-D-123')
    expect(store.applyState).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'capture_pending' }),
      'disputed',
      expect.objectContaining({ captureId: 'CAPTURE123' }),
      '2026-07-23T12:00:01.000Z',
      'PP-D-123',
    )
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-DISPUTE-1',
      'processed',
      'dispute_updated',
      'PP-D-123',
    )
  })

  it('accepts PAYMENT.CAPTURE.DECLINED and maps only re-fetched DECLINED state', async () => {
    const store = storeMocks()
    const client = clientMocks({
      retrievePaymentState: vi.fn().mockResolvedValue({
        captureId: 'CAPTURE123',
        orderId: 'ORDER123',
        purchaseId: purchase().id,
        status: 'denied',
      }),
    })
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-DECLINED-1',
      event_type: 'PAYMENT.CAPTURE.DECLINED',
      resource: { id: 'CAPTURE123' },
    }))

    expect(response.status).toBe(200)
    expect(store.applyState).toHaveBeenCalledWith(
      expect.anything(),
      'denied',
      expect.anything(),
      expect.any(String),
    )
  })

  it('acknowledges a later completion without restoring a disputed terminal purchase', async () => {
    const store = storeMocks({
      applyState: vi.fn().mockResolvedValue('blocked_terminal'),
    })
    const client = clientMocks()
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-COMPLETED-AFTER-DISPUTE',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE123' },
    }))

    expect(response.status).toBe(200)
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-COMPLETED-AFTER-DISPUTE',
      'processed',
      'payment_blocked_terminal',
      'CAPTURE123',
    )
  })

  it('keeps a temporarily missing local purchase retryable', async () => {
    const store = storeMocks({
      findPurchase: vi.fn().mockResolvedValue(null),
    })
    const client = clientMocks()
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-PURCHASE-LATE',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE123' },
    }))

    expect(response.status).toBe(500)
    expect(store.finishEvent).toHaveBeenCalledWith(
      'WH-PURCHASE-LATE',
      'failed',
      'purchase_not_found',
      'CAPTURE123',
    )
  })

  it('rejects an unverified signature before reserving an event ID', async () => {
    const store = storeMocks()
    const client = clientMocks({
      verifyWebhookSignature: vi.fn().mockResolvedValue(false),
    })
    const handler = createPayPalWebhookHandler({
      env: handlerEnv,
      getClient: () => client,
      getStore: () => store,
    })

    const response = await handler(requestFor({
      id: 'WH-EVENT-FORGED',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE123' },
    }))

    expect(response.status).toBe(400)
    expect(store.claimEvent).not.toHaveBeenCalled()
  })

  it('fails closed when PAYPAL_WEBHOOK_ID is absent', async () => {
    const client = clientMocks()
    const handler = createPayPalWebhookHandler({
      env: {} as NodeJS.ProcessEnv,
      getClient: () => client,
    })
    const response = await handler(requestFor({
      id: 'WH-EVENT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
    }))

    expect(response.status).toBe(503)
    expect(client.verifyWebhookSignature).not.toHaveBeenCalled()
  })
})
