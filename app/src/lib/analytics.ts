/**
 * [INPUT]: Event names/PII-free params from UI components and tab changes
 * [OUTPUT]: Forwards page_view and custom events to Google Analytics 4 (gtag.js)
 * [POS]: Thin client-side wrapper that initializes and calls GA4 without inline scripts
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * The GA4 Measurement ID is a public value and is safe to ship in the client.
 * No secrets live here — DeepSeek and PayPal credentials never touch analytics.
 * Every call is guarded, so a blocked/absent gtag simply no-ops.
 */

export const GA_MEASUREMENT_ID = 'G-NB3DMJB5NB'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function sendGtag(...args: unknown[]): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag(...args)
}

/** Initialize GA4 from the local bundle so CSP does not need unsafe-inline. */
export function initializeAnalytics(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (typeof window.gtag === 'function') return

  window.dataLayer = window.dataLayer ?? []
  window.gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
  script.dataset.cinnabarAnalytics = 'true'
  document.head.appendChild(script)
}

/** Manual SPA page_view — automatic collection is disabled in index.html. */
export function trackPageView(path: string, title?: string): void {
  sendGtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : undefined),
    page_location:
      typeof window !== 'undefined' ? window.location.origin + path : path,
  })
}

export type ForecastTierName = '1-year' | '5-year'

/** Named custom events, so call sites stay typo-free and consistent. */
export const analytics = {
  /** Landing page (birth form) came into view. */
  viewLanding: (): void => sendGtag('event', 'view_landing'),

  /** User kicked off a free reading. */
  startReading: (): void => sendGtag('event', 'start_reading'),

  /** A free reading finished generating. */
  completeReading: (): void => sendGtag('event', 'complete_reading'),

  /** The Future Report paywall became visible. */
  viewPaywall: (): void => sendGtag('event', 'view_paywall'),

  /** User initiated checkout (PayPal order creation started). */
  beginCheckout: (tier: ForecastTierName, value: number): void =>
    sendGtag('event', 'begin_checkout', { tier, value, currency: 'USD' }),

  /** Payment captured successfully. */
  purchaseSuccess: (params: {
    tier: ForecastTierName
    value: number
    transactionId?: string
  }): void =>
    sendGtag('event', 'purchase_success', {
      tier: params.tier,
      value: params.value,
      currency: 'USD',
      transaction_id: params.transactionId,
    }),

  /** The Soul Card became visible on the results page. */
  soulCardView: (): void => sendGtag('event', 'soul_card_view'),

  /** User clicked a share action (download / pinterest / x / copy-link). */
  shareClick: (platform: string): void =>
    sendGtag('event', 'share_click', { platform }),

  /** An email was successfully captured. */
  emailCapture: (source: string): void =>
    sendGtag('event', 'email_capture', { source }),

  /** An authenticated user opened the credit wallet. Sends no account data. */
  viewWallet: (): void => sendGtag('event', 'view_wallet'),
}
