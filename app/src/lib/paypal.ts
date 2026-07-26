/**
 * [INPUT]: A signed-in user, Future Report tier, and minimal birth/persona input
 * [OUTPUT]: Renders PayPal buttons backed by server create/capture/verification APIs
 * [POS]: Browser checkout adapter used by FutureReportPaywall.tsx
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * The PayPal client ID is public and only loads the hosted SDK. Prices, the
 * client secret, order creation, capture, and verification all stay server-side.
 */

import type { ForecastTier, Persona } from '@/lib/ai-prompts'
import type { BirthInfo, Gender } from '@/lib/astro'

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined

export function isExplicitlyEnabled(value: unknown): boolean {
  return value === 'true'
}

// New sign-in still begins in the legacy browser SDK before immediate BFF
// migration. Keep the browser payment gate closed until server-side PKCE/login
// replaces this bridge; the server independently fails closed outside opaque.
const LEGACY_LOGIN_BRIDGE_ACTIVE = true
export const futureReportPaymentsEnabled = (
  isExplicitlyEnabled(import.meta.env.VITE_ENABLE_FUTURE_REPORT_PAYMENTS)
  && !LEGACY_LOGIN_BRIDGE_ACTIVE
)

const API_ENDPOINTS = {
  createOrder: '/api/future-report-order',
  captureOrder: '/api/future-report-capture',
  access: '/api/future-report-access',
  generate: '/api/future-report-generate',
} as const

export interface FutureReportBirthInput {
  year: number
  month: number
  day: number
  hour: number
  gender: Gender
  birthplace?: string
  trueSolarEnabled: boolean
  birthTimeReliable: boolean
}

export interface FutureReportRequestInput {
  birth: FutureReportBirthInput
  persona: Persona
}

export interface FutureReportAccess {
  purchase: FutureReportPurchase | null
  chartFingerprint: string
}

export interface FutureReportPurchase {
  purchaseId: string
  tier: ForecastTier
  amountMinor: number
  currency: string
  orderId: string
  paymentStatus: string
  generationStatus: string
  report: string | null
  chartFingerprint: string
}

export interface FutureReportAuthContext {
  ownerId: string
  csrfToken: string
  sessionVersion: string
}

export function authContextMatches(
  expected: FutureReportAuthContext,
  current: FutureReportAuthContext | null,
): boolean {
  return Boolean(
    current &&
    current.ownerId === expected.ownerId &&
    current.sessionVersion === expected.sessionVersion,
  )
}

export function buildFutureReportRequestInput(
  birthInfo: BirthInfo,
  persona: Persona,
): FutureReportRequestInput {
  if (typeof birthInfo.birthTimeReliable !== 'boolean') {
    throw new Error(
      'Recast this chart and confirm whether the birth time is recorded or approximate.',
    )
  }
  return {
    birth: {
      year: birthInfo.year,
      month: birthInfo.month,
      day: birthInfo.day,
      hour: birthInfo.hour,
      gender: birthInfo.gender,
      ...(birthInfo.birthplace ? { birthplace: birthInfo.birthplace } : {}),
      trueSolarEnabled: birthInfo.trueSolarEnabled ?? true,
      birthTimeReliable: birthInfo.birthTimeReliable,
    },
    persona,
  }
}

export function canRetryFutureReport(purchase: FutureReportPurchase | null): boolean {
  return Boolean(
    purchase &&
    purchase.paymentStatus === 'completed' &&
    !purchase.report,
  )
}

interface PayPalApproveData {
  orderID?: string
}

interface PayPalApproveActions {
  restart: () => Promise<void>
}

interface PayPalButtonsInstance {
  isEligible: () => boolean
  render: (selector: string) => Promise<void>
  close?: () => void
}

interface PayPalButtonsConfig {
  style?: Record<string, string>
  createOrder: () => Promise<string>
  onApprove: (data: PayPalApproveData, actions: PayPalApproveActions) => Promise<void>
  onCancel?: () => void
  onError?: (error: unknown) => void
}

interface PayPalNamespace {
  Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance
}

declare global {
  interface Window {
    paypal?: PayPalNamespace
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null

export class FutureReportApiError extends Error {
  readonly code: string | null
  readonly status: number

  constructor(
    message: string,
    code: string | null,
    status: number,
  ) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function shouldRestartPayPal(error: unknown): boolean {
  return (
    error instanceof FutureReportApiError &&
    error.code === 'INSTRUMENT_DECLINED'
  )
}

async function apiRequest<T>(
  url: string,
  csrfToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF': csrfToken,
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    throw new FutureReportApiError(
      typeof body?.error === 'string'
        ? body.error
        : `Payment request failed (${response.status}).`,
      typeof body?.code === 'string' ? body.code : null,
      response.status,
    )
  }
  return body as T
}

function requireAuthContext(
  getAuthContext: () => FutureReportAuthContext | null,
): FutureReportAuthContext {
  const authContext = getAuthContext()
  if (!authContext) {
    throw new Error('Your session has expired. Please sign in again.')
  }
  return authContext
}

function checkoutAttemptStorageKey(userId: string, tier: ForecastTier): string {
  return `cinnabar-paypal-attempt:${userId}:${tier}`
}

export function getOrCreateCheckoutAttempt(userId: string, tier: ForecastTier): string {
  const key = checkoutAttemptStorageKey(userId, tier)
  try {
    const stored = window.localStorage.getItem(key)
    if (stored) return stored
    const attemptId = crypto.randomUUID()
    window.localStorage.setItem(key, attemptId)
    return attemptId
  } catch {
    return crypto.randomUUID()
  }
}

export function clearCheckoutAttempt(userId: string, tier: ForecastTier): void {
  try {
    window.localStorage.removeItem(checkoutAttemptStorageKey(userId, tier))
  } catch {
    // Storage can be disabled; the server still deduplicates every supplied ID.
  }
}

export async function createFutureReportOrder(
  tier: ForecastTier,
  attemptId: string,
  csrfToken: string,
): Promise<string> {
  const result = await apiRequest<{ orderId: string }>(
    API_ENDPOINTS.createOrder,
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ tier, attemptId }),
    },
  )
  if (!result.orderId) throw new Error('Payment service returned no order ID.')
  return result.orderId
}

export async function captureFutureReportOrder(
  orderId: string,
  reportInput: FutureReportRequestInput,
  csrfToken: string,
): Promise<FutureReportPurchase> {
  const result = await apiRequest<{ purchase: FutureReportPurchase }>(
    API_ENDPOINTS.captureOrder,
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ orderId, reportInput }),
    },
  )
  if (!result.purchase?.purchaseId) {
    throw new Error('Payment service returned no verified purchase.')
  }
  return result.purchase
}

export async function fetchFutureReportAccess(
  reportInput: FutureReportRequestInput,
  csrfToken: string,
): Promise<FutureReportAccess> {
  return apiRequest<FutureReportAccess>(
    API_ENDPOINTS.access,
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ reportInput }),
    },
  )
}

export async function generateFutureReport(
  purchaseId: string,
  csrfToken: string,
): Promise<string> {
  const result = await apiRequest<{ report: string }>(
    API_ENDPOINTS.generate,
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ purchaseId }),
    },
  )
  if (!result.report) throw new Error('Report service returned no report.')
  return result.report
}

function loadPayPalSdk(): Promise<PayPalNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PayPal checkout requires a browser environment.'))
  }
  if (!PAYPAL_CLIENT_ID) {
    return Promise.reject(new Error('PayPal checkout is not configured.'))
  }
  if (window.paypal) return Promise.resolve(window.paypal)

  sdkPromise ??= new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.paypal) resolve(window.paypal)
        else reject(new Error('PayPal SDK loaded but did not initialize.'))
      })
      existing.addEventListener('error', () => reject(new Error('Failed to load the PayPal SDK.')))
      return
    }

    const script = document.createElement('script')
    script.id = 'paypal-sdk-script'
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture&locale=en_US`
    script.async = true
    script.onload = () => {
      if (window.paypal) resolve(window.paypal)
      else reject(new Error('PayPal SDK loaded but did not initialize.'))
    }
    script.onerror = () => reject(new Error('Failed to load the PayPal SDK.'))
    document.body.appendChild(script)
  })

  return sdkPromise
}

export interface PayPalCheckoutOptions {
  tier: ForecastTier
  userId: string
  containerId: string
  getAuthContext: () => FutureReportAuthContext | null
  buildReportInput: () => FutureReportRequestInput
    | Promise<FutureReportRequestInput>
  onInitiate?: () => void
  onCaptureStart?: () => void
  onCaptureEnd?: () => void
  onApprove: (purchase: FutureReportPurchase) => void
  onError: (error: Error) => void
  onCancel?: () => void
}

export interface PayPalCheckoutHandle {
  close: () => void
}

/** Renders hosted PayPal buttons. Safe to call once per signed-in mount. */
export async function renderPayPalButtons(
  options: PayPalCheckoutOptions,
): Promise<PayPalCheckoutHandle> {
  const paypal = await loadPayPalSdk()

  const buttons = paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    createOrder: async () => {
      options.onInitiate?.()
      const attemptId = getOrCreateCheckoutAttempt(options.userId, options.tier)
      return createFutureReportOrder(
        options.tier,
        attemptId,
        requireAuthContext(options.getAuthContext).csrfToken,
      )
    },
    onApprove: async (data, actions) => {
      let captureStarted = false
      try {
        if (!data.orderID) throw new Error('PayPal returned no order ID.')
        const reportInput = await options.buildReportInput()
        options.onCaptureStart?.()
        captureStarted = true
        const purchase = await captureFutureReportOrder(
          data.orderID,
          reportInput,
          requireAuthContext(options.getAuthContext).csrfToken,
        )
        clearCheckoutAttempt(options.userId, options.tier)
        options.onApprove(purchase)
      } catch (error) {
        if (shouldRestartPayPal(error)) {
          await actions.restart()
          return
        }
        options.onError(
          error instanceof Error ? error : new Error('Payment verification failed.'),
        )
      } finally {
        if (captureStarted) options.onCaptureEnd?.()
      }
    },
    onCancel: () => {
      clearCheckoutAttempt(options.userId, options.tier)
      options.onCancel?.()
    },
    onError: (error) => {
      options.onError(error instanceof Error ? error : new Error(String(error)))
    },
  })

  if (!buttons.isEligible()) {
    throw new Error('PayPal Checkout is not available in this browser.')
  }

  await buttons.render(`#${options.containerId}`)
  return { close: () => buttons.close?.() }
}
