import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authContextMatches,
  buildFutureReportRequestInput,
  captureFutureReportOrder,
  createFutureReportOrder,
  fetchFutureReportAccess,
  generateFutureReport,
  isExplicitlyEnabled,
  shouldRestartPayPal,
  FutureReportApiError,
} from './paypal'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Future Report payment API client', () => {
  const reportInput = {
    birth: {
      year: 1990,
      month: 1,
      day: 2,
      hour: 12,
      gender: 'male' as const,
      birthplace: 'New York',
      trueSolarEnabled: true,
      birthTimeReliable: true,
    },
    persona: 'scholar' as const,
  }

  it('creates checkout with tier + stable attempt only, never a browser amount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ orderId: 'ORDER-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await createFutureReportOrder(
      '1-year',
      '11111111-1111-4111-8111-111111111111',
      'csrf-token',
    )

    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(request.body)
    expect(body).toEqual({
      tier: '1-year',
      attemptId: '11111111-1111-4111-8111-111111111111',
    })
    expect(body).not.toHaveProperty('amount')
    expect(request.credentials).toBe('same-origin')
    expect(request.headers['X-CSRF']).toBe('csrf-token')
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('captures with birth/persona only, then retries generation by purchase ID', async () => {
    const purchase = {
      purchaseId: '22222222-2222-4222-8222-222222222222',
      tier: '5-year',
      amountMinor: 1490,
      currency: 'USD',
      orderId: 'ORDER-2',
      paymentStatus: 'completed',
      generationStatus: 'not_started',
      report: null,
      chartFingerprint: 'a'.repeat(64),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ purchase }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: 'Recovered report' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await captureFutureReportOrder(
      'ORDER-2',
      reportInput,
      'csrf-token',
    )
    await expect(generateFutureReport(purchase.purchaseId, 'csrf-token'))
      .resolves.toBe('Recovered report')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      orderId: 'ORDER-2',
      reportInput,
    })
    expect(fetchMock.mock.calls[0][1].body).not.toContain('chartFacts')
    expect(fetchMock.mock.calls[0][1].body).not.toContain('yearlyFacts')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      purchaseId: purchase.purchaseId,
    })
  })

  it('enables payments only for the exact explicit flag value', () => {
    expect(isExplicitlyEnabled('true')).toBe(true)
    expect(isExplicitlyEnabled('TRUE')).toBe(false)
    expect(isExplicitlyEnabled('1')).toBe(false)
    expect(isExplicitlyEnabled(undefined)).toBe(false)
  })

  it('drops a delayed account-A result after auth changes to account B', async () => {
    const accountA = {
      ownerId: 'account-a',
      csrfToken: 'csrf-a',
      sessionVersion: 'session-a',
    }
    let currentAuth = accountA
    let committed: string | null = null
    let resolveRequest!: (value: string) => void
    const request = new Promise<string>((resolve) => {
      resolveRequest = resolve
    })
    const completion = request.then((value) => {
      if (authContextMatches(accountA, currentAuth)) committed = value
    })

    currentAuth = {
      ownerId: 'account-b',
      csrfToken: 'csrf-b',
      sessionVersion: 'session-b',
    }
    resolveRequest('account-a-sensitive-report')
    await completion

    expect(committed).toBeNull()
  })

  it('drops a delayed result after the same owner starts a new session', () => {
    const expected = {
      ownerId: 'account-a',
      csrfToken: 'csrf-old',
      sessionVersion: 'session-old',
    }
    const current = {
      ownerId: 'account-a',
      csrfToken: 'csrf-new',
      sessionVersion: 'session-new',
    }

    expect(authContextMatches(expected, current)).toBe(false)
  })

  it('projects BirthInfo to the minimal allowlisted request without resolved chart data', () => {
    const input = buildFutureReportRequestInput({
      ...reportInput.birth,
      resolvedBirthTime: {
        year: 1989,
        month: 12,
        day: 31,
        hour: 23,
        minute: 55,
        timeIndex: 12,
        originalShichen: 'client value',
        correctedShichen: 'client value',
        correctionMinutes: 123,
        applied: true,
        crossedDate: true,
        location: null,
      },
    }, 'sage')

    expect(input).toEqual({
      birth: reportInput.birth,
      persona: 'sage',
    })
    expect(input.birth).not.toHaveProperty('resolvedBirthTime')
  })

  it('posts birth/persona for access and receives the server fingerprint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      purchase: null,
      chartFingerprint: 'b'.repeat(64),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchFutureReportAccess(reportInput, 'csrf-token'))
      .resolves.toEqual({
        purchase: null,
        chartFingerprint: 'b'.repeat(64),
      })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/future-report-access')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin')
    expect(fetchMock.mock.calls[0][1].headers['X-CSRF']).toBe('csrf-token')
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reportInput })
  })

  it('restarts PayPal only for the stable instrument-declined code', () => {
    expect(shouldRestartPayPal(
      new FutureReportApiError('declined', 'INSTRUMENT_DECLINED', 422),
    )).toBe(true)
    expect(shouldRestartPayPal(
      new FutureReportApiError('other', 'PAYPAL_CAPTURE_REJECTED', 422),
    )).toBe(false)
    expect(shouldRestartPayPal(new Error('INSTRUMENT_DECLINED'))).toBe(false)
  })

  it('preserves stable server error codes for PayPal recovery behavior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: 'Choose another funding source.',
        code: 'INSTRUMENT_DECLINED',
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    await expect(captureFutureReportOrder(
      'ORDER-2',
      reportInput,
      'csrf-token',
    )).rejects.toMatchObject({
      code: 'INSTRUMENT_DECLINED',
      status: 422,
    })
  })
})
