/**
 * [INPUT]: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, trusted purchase data, and bounded fetches
 * [OUTPUT]: Timeout-bounded PayPal Orders, webhook verification, capture, and dispute helpers
 * [POS]: Server-only payment boundary for Future Report checkout and PayPal webhooks
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

export type FutureReportTier = '1-year' | '5-year'

export interface FutureReportProduct {
  tier: FutureReportTier
  amountMinor: number
  currency: 'USD'
}

/**
 * The authoritative server-side price catalog. Browser values are display-only;
 * every PayPal order is created from this map.
 */
export const FUTURE_REPORT_CATALOG: Readonly<Record<FutureReportTier, FutureReportProduct>> =
  Object.freeze({
    '1-year': Object.freeze({ tier: '1-year', amountMinor: 990, currency: 'USD' }),
    '5-year': Object.freeze({ tier: '5-year', amountMinor: 1490, currency: 'USD' }),
  })

export interface PayPalExpectedOrder {
  purchaseId: string
  amountMinor: number
  currency: string
}

export interface VerifiedPayPalOrder {
  orderId: string
  captureId: string
  status: 'COMPLETED'
}

interface PayPalAmount {
  currency_code?: unknown
  value?: unknown
}

interface PayPalCapture {
  id?: unknown
  status?: unknown
  amount?: PayPalAmount
  final_capture?: unknown
}

interface PayPalCaptureResource extends PayPalCapture {
  custom_id?: unknown
  supplementary_data?: {
    related_ids?: {
      order_id?: unknown
    }
  }
}

interface PayPalPurchaseUnit {
  reference_id?: unknown
  custom_id?: unknown
  amount?: PayPalAmount
  payee?: {
    merchant_id?: unknown
    email_address?: unknown
  }
  payments?: {
    captures?: PayPalCapture[]
  }
}

interface PayPalOrder {
  id?: unknown
  status?: unknown
  intent?: unknown
  purchase_units?: PayPalPurchaseUnit[]
}

interface PayPalDispute {
  dispute_id?: unknown
  disputed_transactions?: Array<{
    seller_transaction_id?: unknown
  }>
}

export interface PayPalConfiguration {
  clientId: string
  clientSecret: string
  merchantId: string
  environment: 'sandbox' | 'live'
}

type FetchLike = typeof fetch
const DEFAULT_PAYPAL_REQUEST_TIMEOUT_MS = 15_000

export class PayPalApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined

  constructor(
    message: string,
    status: number,
    code: string,
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function readRetryAfterSeconds(response: Response): number {
  const value = response.headers.get('retry-after')
  if (!value || !/^[0-9]{1,5}$/.test(value)) return 60
  return Math.min(3_600, Math.max(1, Number(value)))
}

export interface VerifiedPayPalCaptureBinding {
  captureId: string
  orderId: string
  purchaseId: string
}

export type VerifiedPayPalPaymentStatus =
  | 'completed'
  | 'refunded'
  | 'denied'
  | 'pending'

export interface VerifiedPayPalPaymentState extends VerifiedPayPalCaptureBinding {
  status: VerifiedPayPalPaymentStatus
}

function minorUnitsToDecimal(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error('Invalid trusted payment amount.')
  }
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`
}

function readConfiguration(env: NodeJS.ProcessEnv = process.env): PayPalConfiguration {
  const clientId = env.PAYPAL_CLIENT_ID
  const clientSecret = env.PAYPAL_CLIENT_SECRET
  const merchantId = env.PAYPAL_MERCHANT_ID
  const environment = env.PAYPAL_ENV

  if (!clientId || !clientSecret || !merchantId) {
    throw new Error('PayPal server credentials are not configured.')
  }
  if (environment !== 'sandbox' && environment !== 'live') {
    throw new Error('PAYPAL_ENV must be either "sandbox" or "live".')
  }
  return { clientId, clientSecret, merchantId, environment }
}

export function getFutureReportProduct(tier: unknown): FutureReportProduct | null {
  return tier === '1-year' || tier === '5-year' ? FUTURE_REPORT_CATALOG[tier] : null
}

export class PayPalServerClient {
  private readonly configuration: PayPalConfiguration
  private readonly fetchImpl: FetchLike
  private readonly baseUrl: string
  private readonly requestTimeoutMs: number
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0

  constructor(
    configuration: PayPalConfiguration,
    fetchImpl: FetchLike = fetch,
    requestTimeoutMs = DEFAULT_PAYPAL_REQUEST_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error('PayPal request timeout must be a positive number.')
    }
    this.configuration = configuration
    this.fetchImpl = fetchImpl
    this.requestTimeoutMs = requestTimeoutMs
    this.baseUrl =
      configuration.environment === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com'
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController()
    const upstreamSignal = init.signal
    const forwardAbort = () => controller.abort(upstreamSignal?.reason)
    if (upstreamSignal?.aborted) {
      forwardAbort()
    } else {
      upstreamSignal?.addEventListener('abort', forwardAbort, { once: true })
    }

    let timedOut = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutError = new PayPalApiError(
      'PayPal request timed out.',
      504,
      'PAYPAL_REQUEST_TIMEOUT',
    )
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort(timeoutError)
        reject(timeoutError)
      }, this.requestTimeoutMs)
    })

    try {
      return await Promise.race([
        Promise.resolve(this.fetchImpl(input, {
          ...init,
          signal: controller.signal,
        })),
        timeout,
      ])
    } catch (error) {
      if (timedOut) throw timeoutError
      throw error
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      upstreamSignal?.removeEventListener('abort', forwardAbort)
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken
    }

    const basic = btoa(`${this.configuration.clientId}:${this.configuration.clientSecret}`)
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!response.ok) {
      throw new Error(`PayPal authentication failed (${response.status}).`)
    }

    const body = await response.json() as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new Error('PayPal authentication returned no access token.')
    }

    const expiresInSeconds =
      typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
        ? body.expires_in
        : 300
    this.accessToken = body.access_token
    this.accessTokenExpiresAt = Date.now() + Math.max(30, expiresInSeconds - 60) * 1_000
    return this.accessToken
  }

  private async authorizedFetch(path: string, init: RequestInit): Promise<Response> {
    const accessToken = await this.getAccessToken()
    return this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    })
  }

  async verifyWebhookSignature(
    headers: Headers,
    webhookEvent: Record<string, unknown>,
    webhookId: string,
  ): Promise<boolean> {
    const authAlgo = headers.get('paypal-auth-algo')
    const certUrl = headers.get('paypal-cert-url')
    const transmissionId = headers.get('paypal-transmission-id')
    const transmissionSignature = headers.get('paypal-transmission-sig')
    const transmissionTime = headers.get('paypal-transmission-time')
    if (
      !authAlgo ||
      !certUrl ||
      !transmissionId ||
      !transmissionSignature ||
      !transmissionTime
    ) {
      return false
    }

    const response = await this.authorizedFetch(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSignature,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: webhookEvent,
        }),
      },
    )
    if (!response.ok) {
      throw new Error(`PayPal webhook verification failed (${response.status}).`)
    }
    const body = await response.json() as { verification_status?: unknown }
    return body.verification_status === 'SUCCESS'
  }

  async createOrder(expected: PayPalExpectedOrder): Promise<string> {
    const response = await this.authorizedFetch('/v2/checkout/orders', {
      method: 'POST',
      headers: {
        // PayPal caps this header at 38 characters. Prefix + UUID is exactly 38.
        'PayPal-Request-Id': `o:${expected.purchaseId}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: expected.purchaseId,
            custom_id: expected.purchaseId,
            amount: {
              currency_code: expected.currency,
              value: minorUnitsToDecimal(expected.amountMinor),
            },
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`PayPal order creation failed (${response.status}).`)
    }
    const body = await response.json() as PayPalOrder
    if (typeof body.id !== 'string' || !body.id) {
      throw new Error('PayPal order creation returned no order ID.')
    }
    return body.id
  }

  async retrieveAndVerifyOrder(
    orderId: string,
    expected: PayPalExpectedOrder,
  ): Promise<VerifiedPayPalOrder> {
    const response = await this.authorizedFetch(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      if (response.status === 429) {
        throw new PayPalApiError(
          'PayPal order verification is rate limited.',
          429,
          'PAYPAL_RATE_LIMITED',
          readRetryAfterSeconds(response),
        )
      }
      throw new Error(`PayPal order verification failed (${response.status}).`)
    }
    const order = await response.json() as PayPalOrder
    return verifyCompletedOrder(order, expected, orderId, this.configuration.merchantId)
  }

  async retrieveCaptureBinding(captureId: string): Promise<VerifiedPayPalCaptureBinding> {
    const response = await this.authorizedFetch(
      `/v2/payments/captures/${encodeURIComponent(captureId)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      throw new Error(`PayPal capture verification failed (${response.status}).`)
    }
    const capture = await response.json() as PayPalCaptureResource
    const orderId = capture.supplementary_data?.related_ids?.order_id
    if (
      capture.id !== captureId ||
      typeof orderId !== 'string' ||
      !orderId ||
      typeof capture.custom_id !== 'string' ||
      !capture.custom_id
    ) {
      throw new Error('PayPal capture is missing authoritative order linkage.')
    }
    return {
      captureId,
      orderId,
      purchaseId: capture.custom_id,
    }
  }

  async retrievePaymentState(
    orderId: string,
    expected: PayPalExpectedOrder,
    captureId: string,
  ): Promise<VerifiedPayPalPaymentState> {
    const response = await this.authorizedFetch(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      throw new Error(`PayPal order verification failed (${response.status}).`)
    }
    const order = await response.json() as PayPalOrder
    const state = verifyOrderPaymentState(
      order,
      expected,
      orderId,
      captureId,
      this.configuration.merchantId,
    )
    if (!state) throw new Error('PayPal order does not contain a capture.')
    return state
  }

  async retrieveOrderPaymentState(
    orderId: string,
    expected: PayPalExpectedOrder,
  ): Promise<VerifiedPayPalPaymentState | null> {
    const response = await this.authorizedFetch(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      if (response.status === 429) {
        throw new PayPalApiError(
          'PayPal order verification is rate limited.',
          429,
          'PAYPAL_RATE_LIMITED',
          readRetryAfterSeconds(response),
        )
      }
      throw new Error(`PayPal order verification failed (${response.status}).`)
    }
    const order = await response.json() as PayPalOrder
    return verifyOrderPaymentState(
      order,
      expected,
      orderId,
      undefined,
      this.configuration.merchantId,
      true,
    )
  }

  async retrieveDisputeCaptureIds(disputeId: string): Promise<string[]> {
    const response = await this.authorizedFetch(
      `/v1/customer/disputes/${encodeURIComponent(disputeId)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      throw new Error(`PayPal dispute verification failed (${response.status}).`)
    }
    const dispute = await response.json() as PayPalDispute
    if (dispute.dispute_id !== disputeId || !Array.isArray(dispute.disputed_transactions)) {
      throw new Error('PayPal dispute is missing authoritative transaction linkage.')
    }
    const captureIds = dispute.disputed_transactions
      .map((transaction) => transaction.seller_transaction_id)
      .filter((value): value is string => (
        typeof value === 'string' && /^[A-Za-z0-9]{1,50}$/.test(value)
      ))
    return [...new Set(captureIds)]
  }

  async captureAndVerifyOrder(
    orderId: string,
    expected: PayPalExpectedOrder,
  ): Promise<VerifiedPayPalOrder> {
    const response = await this.authorizedFetch(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        headers: {
          'PayPal-Request-Id': `c:${expected.purchaseId}`,
          Prefer: 'return=representation',
        },
        body: '{}',
      },
    )

    if (!response.ok) {
      const body = await response.json().catch(() => null) as {
        details?: Array<{ issue?: unknown }>
      } | null
      const issues = new Set(
        body?.details
          ?.map((detail) => detail.issue)
          .filter((issue): issue is string => typeof issue === 'string') ?? [],
      )
      if (response.status === 422 && issues.has('ORDER_ALREADY_CAPTURED')) {
        return this.retrieveAndVerifyOrder(orderId, expected)
      }
      if (response.status === 422 && issues.has('INSTRUMENT_DECLINED')) {
        throw new PayPalApiError(
          'PayPal declined that funding source. Choose another one.',
          422,
          'INSTRUMENT_DECLINED',
        )
      }
      throw new PayPalApiError(
        'PayPal rejected the capture.',
        response.status,
        'PAYPAL_CAPTURE_REJECTED',
      )
    }
    return this.retrieveAndVerifyOrder(orderId, expected)
  }

}

export function verifyCompletedOrder(
  order: PayPalOrder,
  expected: PayPalExpectedOrder,
  requestedOrderId: string,
  expectedMerchantId: string,
): VerifiedPayPalOrder {
  if (order.status !== 'COMPLETED') {
    throw new Error('PayPal order is not completed.')
  }
  const state = verifyOrderPaymentState(
    order,
    expected,
    requestedOrderId,
    undefined,
    expectedMerchantId,
  )
  if (!state || state.status !== 'completed') {
    throw new Error('PayPal order is not completed.')
  }
  return { orderId: state.orderId, captureId: state.captureId, status: 'COMPLETED' }
}

export function verifyOrderPaymentState(
  order: PayPalOrder,
  expected: PayPalExpectedOrder,
  requestedOrderId: string,
  requestedCaptureId: string | undefined,
  expectedMerchantId: string,
  allowMissingCapture = false,
): VerifiedPayPalPaymentState | null {
  if (order.id !== requestedOrderId || order.intent !== 'CAPTURE') {
    throw new Error('PayPal order identity or intent is invalid.')
  }
  const units = order.purchase_units
  if (!Array.isArray(units) || units.length !== 1) {
    throw new Error('PayPal order has an unexpected purchase-unit count.')
  }
  const unit = units[0]
  if (unit.reference_id !== expected.purchaseId || unit.custom_id !== expected.purchaseId) {
    throw new Error('PayPal order does not match the purchase record.')
  }
  if (unit.payee?.merchant_id !== expectedMerchantId) {
    throw new Error('PayPal order payee does not match the configured merchant.')
  }

  const expectedValue = minorUnitsToDecimal(expected.amountMinor)
  if (
    unit.amount?.currency_code !== expected.currency ||
    unit.amount?.value !== expectedValue
  ) {
    throw new Error('PayPal order amount or currency does not match the trusted price.')
  }

  const captures = unit.payments?.captures ?? []
  if (allowMissingCapture && captures.length === 0) return null
  const matchingCaptures = requestedCaptureId
    ? captures.filter((capture) => capture.id === requestedCaptureId)
    : captures
  if (matchingCaptures.length !== 1) {
    throw new Error('PayPal order does not contain exactly one matching capture.')
  }
  const capture = matchingCaptures[0]
  if (
    typeof capture.id !== 'string' ||
    capture.final_capture !== true ||
    capture.amount?.currency_code !== expected.currency ||
    capture.amount?.value !== expectedValue
  ) {
    throw new Error('PayPal capture amount or currency does not match the trusted price.')
  }

  let status: VerifiedPayPalPaymentStatus
  switch (capture.status) {
    case 'COMPLETED':
      status = 'completed'
      break
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      status = 'refunded'
      break
    case 'DECLINED':
    case 'FAILED':
      status = 'denied'
      break
    default:
      status = 'pending'
  }

  return {
    orderId: order.id as string,
    captureId: capture.id,
    purchaseId: expected.purchaseId,
    status,
  }
}

let cachedClient: PayPalServerClient | null = null

export function getPayPalServerClient(): PayPalServerClient {
  if (!cachedClient) {
    cachedClient = new PayPalServerClient(readConfiguration())
  }
  return cachedClient
}
