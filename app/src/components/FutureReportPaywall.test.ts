import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { FutureReportPaywall } from './FutureReportPaywall'
import { canRetryFutureReport, type FutureReportPurchase } from '@/lib/paypal'
import { useAuthStore } from '@/stores'

afterEach(() => {
  useAuthStore.setState({
    user: null,
    csrfToken: null,
    sessionVersion: null,
    initialized: false,
    error: null,
  })
})

describe('FutureReportPaywall recovery behavior', () => {
  it('renders no paywall or checkout while the feature flag is disabled', () => {
    useAuthStore.setState({
      initialized: true,
      user: null,
      csrfToken: null,
      sessionVersion: null,
    })
    const html = renderToStaticMarkup(createElement(FutureReportPaywall))

    expect(html).toBe('')
    expect(html).not.toContain('cinnabar-paypal-1-year')
  })

  it('offers a no-recapture retry for a verified purchase without a report', () => {
    const purchase: FutureReportPurchase = {
      purchaseId: '22222222-2222-4222-8222-222222222222',
      tier: '1-year',
      amountMinor: 990,
      currency: 'USD',
      orderId: 'ORDER-2',
      paymentStatus: 'completed',
      generationStatus: 'failed',
      report: null,
      chartFingerprint: 'a'.repeat(64),
    }

    expect(canRetryFutureReport(purchase)).toBe(true)
    expect(canRetryFutureReport({ ...purchase, report: 'done' })).toBe(false)
  })
})
