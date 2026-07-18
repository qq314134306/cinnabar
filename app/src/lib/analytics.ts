/**
 * [INPUT]: Semantic page views and product events from the UI layer
 * [OUTPUT]: Forwards them to Google Analytics 4 via the global gtag() queue
 * [POS]: Thin, framework-agnostic analytics wrapper used across components
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * The GA4 Measurement ID is a public value (like a Stripe publishable key) and
 * is loaded from index.html. This module never touches any secret. gtag.js is
 * configured there with `send_page_view: false` so this SPA can emit its own
 * page_view on every in-app navigation instead of only on the first load.
 */

/** Public GA4 Measurement ID — safe to ship in the client bundle. */
export const GA_MEASUREMENT_ID = 'G-NB3DMJB5NB'

type GtagArgs =
  | ['js', Date]
  | ['config', string, Record<string, unknown>?]
  | ['event', string, Record<string, unknown>?]
  | ['set', Record<string, unknown>]

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: GtagArgs) => void
  }
}

/** No-op unless gtag.js has loaded (SSR-safe, ad-blocker-safe). */
function gtag(...args: GtagArgs): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag(...args)
}

/**
 * Emit a GA4 page_view for an in-app view. Because tab navigation never changes
 * the browser URL, we synthesise a virtual page_location so each view is a
 * distinct page in GA reports.
 */
export function trackPageView(virtualPath: string, title?: string): void {
  if (typeof window === 'undefined') return
  gtag('event', 'page_view', {
    page_location: window.location.origin + virtualPath,
    page_title: title ?? document.title,
  })
}

/** Custom events tracked across the Cinnabar funnel. */
export type AnalyticsEvent =
  | 'view_landing'
  | 'start_reading'
  | 'complete_reading'
  | 'view_paywall'
  | 'begin_checkout'
  | 'purchase_success'

export function trackEvent(event: AnalyticsEvent, params?: Record<string, unknown>): void {
  gtag('event', event, params)
}
