/**
 * [INPUT]: Event names/params from UI components and tab changes
 * [OUTPUT]: Forwards page_view and custom events to Google Analytics 4 (gtag.js)
 * [POS]: Thin client-side wrapper over the window.gtag loaded in index.html
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

/** Where an email capture / soul card interaction originated. */
export type CaptureSource = 'reading' | 'exit_intent' | 'soul_card'

/** Social/share destinations tracked on the Soul Card. */
export type SharePlatform = 'download' | 'pinterest' | 'x' | 'copy_link'

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

  /** The Soul Card came into view on the results page. */
  soulCardView: (): void => sendGtag('event', 'soul_card_view'),

  /** User tapped a share action on the Soul Card. */
  shareClick: (platform: SharePlatform): void =>
    sendGtag('event', 'share_click', { platform }),

  /** A visitor submitted their email through an EmailCapture entry point. */
  emailCapture: (source: CaptureSource): void =>
    sendGtag('event', 'email_capture', { source }),
}
