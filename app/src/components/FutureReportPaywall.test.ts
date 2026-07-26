// @vitest-environment jsdom

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnabledFutureReportPaywall,
  FutureReportPaywall,
} from './FutureReportPaywall'
import {
  buildFutureReportRequestInput,
  canRetryFutureReport,
  type FutureReportAccess,
  type FutureReportPurchase,
  type PayPalCheckoutOptions,
} from '@/lib/paypal'
import { generateChart, type BirthInfo } from '@/lib/astro'
import {
  useAuthStore,
  useChartStore,
  useContentCacheStore,
  useFutureReportActivityStore,
  useSettingsStore,
} from '@/stores'

const paypalMocks = vi.hoisted(() => ({
  fetchFutureReportAccess: vi.fn(),
  generateFutureReport: vi.fn(),
  renderPayPalButtons: vi.fn(),
}))

vi.mock('@/lib/paypal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paypal')>()
  return {
    ...actual,
    fetchFutureReportAccess: paypalMocks.fetchFutureReportAccess,
    generateFutureReport: paypalMocks.generateFutureReport,
    renderPayPalButtons: paypalMocks.renderPayPalButtons,
  }
})

const BIRTH_A: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 10,
  gender: 'male',
  birthplace: 'Chengdu',
  trueSolarEnabled: true,
  birthTimeReliable: false,
}

const BIRTH_B: BirthInfo = {
  ...BIRTH_A,
  hour: 20,
}

afterEach(() => {
  cleanup()
  paypalMocks.fetchFutureReportAccess.mockReset()
  paypalMocks.generateFutureReport.mockReset()
  paypalMocks.renderPayPalButtons.mockReset()
  useAuthStore.setState({
    user: null,
    csrfToken: null,
    sessionVersion: null,
    initialized: false,
    error: null,
  })
  useChartStore.setState({ birthInfo: null, chart: null })
  useContentCacheStore.getState().clearAll()
  useFutureReportActivityStore.setState({ captureCount: 0 })
  useSettingsStore.setState({ persona: 'scholar' })
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
    const purchase = futurePurchase('ORDER-2', 'a'.repeat(64))

    expect(canRetryFutureReport(purchase)).toBe(true)
    expect(canRetryFutureReport({ ...purchase, report: 'done' })).toBe(false)
  })

  it('drops a pending access result after the chart changes', async () => {
    signInAndCast(BIRTH_A)
    const accessA = deferred<FutureReportAccess>()
    paypalMocks.fetchFutureReportAccess
      .mockReturnValueOnce(accessA.promise)
      .mockResolvedValueOnce({
        purchase: null,
        chartFingerprint: 'b'.repeat(64),
      })
    paypalMocks.renderPayPalButtons.mockResolvedValue({ close: vi.fn() })
    const keyA = chartKey(BIRTH_A)
    const view = render(createElement(
      EnabledFutureReportPaywall,
      { key: keyA, chartContextKey: keyA },
    ))

    act(() => {
      useChartStore.getState().replaceChart(BIRTH_B, generateChart(BIRTH_B))
    })
    const keyB = chartKey(BIRTH_B)
    view.rerender(createElement(
      EnabledFutureReportPaywall,
      { key: keyB, chartContextKey: keyB },
    ))
    await waitFor(() => {
      expect(paypalMocks.fetchFutureReportAccess).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      accessA.resolve({
        purchase: {
          ...futurePurchase('OLD-ORDER', 'a'.repeat(64)),
          report: 'old chart report',
          generationStatus: 'completed',
        },
        chartFingerprint: 'a'.repeat(64),
      })
      await accessA.promise
    })

    expect(useContentCacheStore.getState().futureReport).toBeNull()
    expect(screen.queryByText('old chart report')).toBeNull()
  })

  it('does not cache a pending generation after the chart changes', async () => {
    signInAndCast(BIRTH_A)
    const purchaseA = futurePurchase('ORDER-A', 'a'.repeat(64))
    const generation = deferred<string>()
    paypalMocks.fetchFutureReportAccess
      .mockResolvedValueOnce({
        purchase: purchaseA,
        chartFingerprint: purchaseA.chartFingerprint,
      })
      .mockResolvedValueOnce({
        purchase: null,
        chartFingerprint: 'b'.repeat(64),
      })
    paypalMocks.generateFutureReport.mockReturnValueOnce(generation.promise)
    paypalMocks.renderPayPalButtons.mockResolvedValue({ close: vi.fn() })
    const keyA = chartKey(BIRTH_A)
    const view = render(createElement(
      EnabledFutureReportPaywall,
      { key: keyA, chartContextKey: keyA },
    ))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Generate / Retry report',
    }))
    expect(paypalMocks.generateFutureReport).toHaveBeenCalledOnce()

    act(() => {
      useChartStore.getState().replaceChart(BIRTH_B, generateChart(BIRTH_B))
    })
    const keyB = chartKey(BIRTH_B)
    view.rerender(createElement(
      EnabledFutureReportPaywall,
      { key: keyB, chartContextKey: keyB },
    ))
    await waitFor(() => {
      expect(paypalMocks.fetchFutureReportAccess).toHaveBeenCalledTimes(2)
    })
    await act(async () => {
      generation.resolve('stale generated report')
      await generation.promise
    })

    expect(useContentCacheStore.getState().futureReport).toBeNull()
    expect(screen.queryByText('stale generated report')).toBeNull()
  })

  it('blocks chart replacement from capture start until verified approval is visible', async () => {
    signInAndCast(BIRTH_A)
    paypalMocks.fetchFutureReportAccess.mockResolvedValueOnce({
      purchase: null,
      chartFingerprint: 'a'.repeat(64),
    })
    paypalMocks.generateFutureReport.mockResolvedValueOnce('verified report')
    const close = vi.fn()
    paypalMocks.renderPayPalButtons.mockResolvedValue({ close })
    const keyA = chartKey(BIRTH_A)
    const view = render(createElement(
      EnabledFutureReportPaywall,
      { key: keyA, chartContextKey: keyA },
    ))
    await waitFor(() => {
      expect(paypalMocks.renderPayPalButtons).toHaveBeenCalledTimes(2)
    })
    const oldCheckout = paypalMocks.renderPayPalButtons.mock.calls[0]?.[0] as
      | PayPalCheckoutOptions
      | undefined

    oldCheckout?.onCaptureStart?.()
    expect(useFutureReportActivityStore.getState().captureCount).toBe(1)
    expect(
      useChartStore.getState().replaceChart(BIRTH_B, generateChart(BIRTH_B)),
    ).toBe(false)
    expect(useChartStore.getState().birthInfo).toEqual(BIRTH_A)
    act(() => {
      oldCheckout?.onApprove(futurePurchase('OLD-ORDER', 'a'.repeat(64)))
      oldCheckout?.onCaptureEnd?.()
    })

    await waitFor(() => {
      expect(useContentCacheStore.getState().futureReport?.text).toBe(
        'verified report',
      )
    })
    expect(paypalMocks.generateFutureReport).toHaveBeenCalledOnce()
    expect(useFutureReportActivityStore.getState().captureCount).toBe(0)
    view.unmount()
    expect(close).toHaveBeenCalledTimes(2)
  })
})

function chartKey(birthInfo: BirthInfo): string {
  return JSON.stringify(buildFutureReportRequestInput(birthInfo, 'scholar'))
}

function signInAndCast(birthInfo: BirthInfo): void {
  useAuthStore.setState({
    initialized: true,
    user: { id: 'user-1', email: 'reader@example.com' },
    csrfToken: 'csrf-token',
    sessionVersion: 'session-1',
  })
  useChartStore.setState({
    birthInfo,
    chart: generateChart(birthInfo),
  })
}

function futurePurchase(
  orderId: string,
  chartFingerprint: string,
): FutureReportPurchase {
  return {
    purchaseId: '22222222-2222-4222-8222-222222222222',
    tier: '1-year',
    amountMinor: 990,
    currency: 'USD',
    orderId,
    paymentStatus: 'completed',
    generationStatus: 'failed',
    report: null,
    chartFingerprint,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
