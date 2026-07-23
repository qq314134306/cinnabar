import { describe, expect, it, vi } from 'vitest'
import {
  FUTURE_REPORT_CATALOG,
  PayPalServerClient,
  verifyCompletedOrder,
} from '../api/_paypal'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function completedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'PAYPAL-ORDER-1',
    status: 'COMPLETED',
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'purchase-1',
        custom_id: 'purchase-1',
        amount: { currency_code: 'USD', value: '9.90' },
        payee: { merchant_id: 'MERCHANT-1' },
        payments: {
          captures: [
            {
              id: 'CAPTURE-1',
              status: 'COMPLETED',
              amount: { currency_code: 'USD', value: '9.90' },
              final_capture: true,
            },
          ],
        },
      },
    ],
    ...overrides,
  }
}

describe('PayPal server payment boundary', () => {
  it('uses PayPal official API with the original delivery headers and event object', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'server-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ verification_status: 'SUCCESS' }))
    const client = new PayPalServerClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        merchantId: 'MERCHANT-1',
        environment: 'sandbox',
      },
      fetchMock,
    )
    const event = {
      id: 'WH-EVENT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE-1' },
    }
    const headers = new Headers({
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'transmission-1',
      'paypal-transmission-sig': 'signature-1',
      'paypal-transmission-time': '2026-07-23T12:00:00Z',
    })

    await expect(client.verifyWebhookSignature(
      headers,
      event,
      'WEBHOOK123',
    )).resolves.toBe(true)

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api-m.sandbox.paypal.com/cert',
      transmission_id: 'transmission-1',
      transmission_sig: 'signature-1',
      transmission_time: '2026-07-23T12:00:00Z',
      webhook_id: 'WEBHOOK123',
      webhook_event: event,
    })
  })

  it('creates an order using integer minor units and a stable business idempotency key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'server-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'PAYPAL-ORDER-1' }, 201))
    const client = new PayPalServerClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        merchantId: 'MERCHANT-1',
        environment: 'sandbox',
      },
      fetchMock,
    )
    const product = FUTURE_REPORT_CATALOG['1-year']

    await expect(client.createOrder({
      purchaseId: 'purchase-1',
      amountMinor: product.amountMinor,
      currency: product.currency,
    })).resolves.toBe('PAYPAL-ORDER-1')

    const [, request] = fetchMock.mock.calls[1]
    expect(request.headers['PayPal-Request-Id']).toBe('o:purchase-1')
    expect(JSON.parse(request.body)).toEqual({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: 'purchase-1',
          custom_id: 'purchase-1',
          amount: { currency_code: 'USD', value: '9.90' },
        },
      ],
    })
  })

  it('treats a repeated capture as safe only after re-fetching and verifying PayPal state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'server-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        details: [{ issue: 'ORDER_ALREADY_CAPTURED' }],
      }, 422))
      .mockResolvedValueOnce(jsonResponse(completedOrder()))
    const client = new PayPalServerClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        merchantId: 'MERCHANT-1',
        environment: 'sandbox',
      },
      fetchMock,
    )

    await expect(client.captureAndVerifyOrder('PAYPAL-ORDER-1', {
      purchaseId: 'purchase-1',
      amountMinor: 990,
      currency: 'USD',
    })).resolves.toEqual({
      orderId: 'PAYPAL-ORDER-1',
      captureId: 'CAPTURE-1',
      status: 'COMPLETED',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['non-terminal status', completedOrder({ status: 'APPROVED' })],
    ['wrong returned order ID', completedOrder({ id: 'OTHER-ORDER' })],
    ['wrong intent', completedOrder({ intent: 'AUTHORIZE' })],
    ['wrong order currency', completedOrder({
      purchase_units: [{
        ...completedOrder().purchase_units[0],
        amount: { currency_code: 'EUR', value: '9.90' },
      }],
    })],
    ['wrong captured amount', completedOrder({
      purchase_units: [{
        ...completedOrder().purchase_units[0],
        payments: {
          captures: [{
            id: 'CAPTURE-1',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '0.01' },
          }],
        },
      }],
    })],
    ['wrong payee', completedOrder({
      purchase_units: [{
        ...completedOrder().purchase_units[0],
        payee: { merchant_id: 'ATTACKER' },
      }],
    })],
    ['non-final capture', completedOrder({
      purchase_units: [{
        ...completedOrder().purchase_units[0],
        payments: {
          captures: [{
            ...completedOrder().purchase_units[0].payments.captures[0],
            final_capture: false,
          }],
        },
      }],
    })],
  ])('rejects %s', (_label, order) => {
    expect(() => verifyCompletedOrder(
      order,
      {
        purchaseId: 'purchase-1',
        amountMinor: 990,
        currency: 'USD',
      },
      'PAYPAL-ORDER-1',
      'MERCHANT-1',
    )).toThrow()
  })

  it('returns INSTRUMENT_DECLINED without treating it as an idempotent capture', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'server-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        details: [{ issue: 'INSTRUMENT_DECLINED' }],
      }, 422))
    const client = new PayPalServerClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        merchantId: 'MERCHANT-1',
        environment: 'sandbox',
      },
      fetchMock,
    )

    await expect(client.captureAndVerifyOrder('PAYPAL-ORDER-1', {
      purchaseId: 'purchase-1',
      amountMinor: 990,
      currency: 'USD',
    })).rejects.toMatchObject({
      code: 'INSTRUMENT_DECLINED',
      status: 422,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not swallow unrelated 422 responses as idempotent success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'server-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        details: [{ issue: 'PAYER_CANNOT_PAY' }],
      }, 422))
    const client = new PayPalServerClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        merchantId: 'MERCHANT-1',
        environment: 'sandbox',
      },
      fetchMock,
    )

    await expect(client.captureAndVerifyOrder('PAYPAL-ORDER-1', {
      purchaseId: 'purchase-1',
      amountMinor: 990,
      currency: 'USD',
    })).rejects.toMatchObject({
      code: 'PAYPAL_CAPTURE_REJECTED',
      status: 422,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
