import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FUTURE_REPORT_DEEPSEEK_POLICY,
  handleFutureReportGenerate,
  type FutureReportGenerationStore,
} from '../api/future-report-generate'
import type { FutureReportPurchaseRow } from '../api/_future-report'

const PURCHASE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const STARTED_AT = '2026-07-23T12:00:00.000Z'
const COMPLETED_AT = '2026-07-23T12:00:01.000Z'
const FINGERPRINT = 'a'.repeat(64)

const generationInput = {
  snapshotVersion: 'future-report.server-chart.v1',
  birth: {
    calendar: 'solar',
    date: '1990-01-15',
    hour: 10,
    gender: 'female',
    birthTimeReliable: true,
    trueSolarEnabled: false,
    location: null,
    resolved: {
      date: '1990-01-15',
      hour: 10,
      minute: 0,
      timeIndex: 5,
      correctionMinutes: 0,
      trueSolarApplied: false,
    },
  },
  persona: 'scholar',
  currentYear: 2026,
  years: [2026, 2027],
  chartFacts: 'Server-owned natal chart facts.',
  yearlyFacts: 'Server-owned annual chart facts.',
  chartFingerprint: FINGERPRINT,
} as const

const purchase: FutureReportPurchaseRow = {
  id: PURCHASE_ID,
  user_id: USER_ID,
  tier: '1-year',
  amount_minor: 990,
  currency: 'USD',
  client_attempt_id: '33333333-3333-4333-8333-333333333333',
  paypal_order_id: 'PAYPALORDER1',
  paypal_capture_id: 'PAYPALCAPTURE1',
  payment_status: 'completed',
  payment_completed_at: '2026-07-23T11:00:00.000Z',
  generation_input: generationInput,
  generation_status: 'not_started',
  generation_started_at: null,
  generated_report: null,
  generation_completed_at: null,
  created_at: '2026-07-23T10:00:00.000Z',
  chart_fingerprint: FINGERPRINT,
  generation_attempt_count: 0,
  generation_next_retry_at: null,
}

interface StoreMocks {
  store: FutureReportGenerationStore
  loadPurchase: ReturnType<typeof vi.fn>
  claimPurchase: ReturnType<typeof vi.fn>
  saveReport: ReturnType<typeof vi.fn>
  failGeneration: ReturnType<typeof vi.fn>
}

function createStore(): StoreMocks {
  const loadPurchase = vi.fn().mockResolvedValue(purchase)
  const claimPurchase = vi.fn((
    _purchaseId: string,
    _userId: string,
    generationStartedAt: string,
  ) => Promise.resolve({
    ...purchase,
    generation_status: 'generating',
    generation_started_at: generationStartedAt,
    generation_attempt_count: 1,
  }))
  const saveReport = vi.fn((
    _purchaseId: string,
    _generationStartedAt: string,
    report: string,
  ) => Promise.resolve(report))
  const failGeneration = vi.fn().mockResolvedValue(undefined)
  return {
    store: {
      loadPurchase,
      claimPurchase,
      saveReport,
      failGeneration,
    },
    loadPurchase,
    claimPurchase,
    saveReport,
    failGeneration,
  }
}

function request(signal?: AbortSignal): Request {
  return new Request('https://cinnabar.example/api/future-report-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId: PURCHASE_ID }),
    signal,
  })
}

function jsonCompletion(report = 'A bounded server-generated report.'): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: report } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function nowSequence(): () => Date {
  const values = [
    new Date(STARTED_AT),
    new Date(COMPLETED_AT),
  ]
  return () => values.shift() ?? new Date(COMPLETED_AT)
}

function baseDependencies(store: FutureReportGenerationStore) {
  return {
    authenticate: vi.fn().mockResolvedValue({ id: USER_ID }),
    store,
    now: nowSequence(),
  }
}

beforeEach(() => {
  process.env.ENABLE_FUTURE_REPORT_PAYMENTS = 'true'
  process.env.AUTH_MODE = 'opaque'
  process.env.DEEPSEEK_API_KEY = 'server-only-deepseek-key'
})

afterEach(() => {
  delete process.env.ENABLE_FUTURE_REPORT_PAYMENTS
  delete process.env.AUTH_MODE
  delete process.env.DEEPSEEK_API_KEY
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('paid Future Report bounded DeepSeek generation', () => {
  it('returns an already completed report without requiring DeepSeek configuration', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const mocks = createStore()
    mocks.loadPurchase.mockResolvedValue({
      ...purchase,
      generation_status: 'completed',
      generated_report: 'Previously saved report.',
      generation_completed_at: COMPLETED_AT,
    })
    const fetchImpl = vi.fn()

    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      report: 'Previously saved report.',
    })
    expect(mocks.claimPurchase).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses a fixed policy and saves with the exact generation claim CAS', async () => {
    const mocks = createStore()
    const fetchImpl = vi.fn().mockResolvedValue(jsonCompletion())

    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      report: 'A bounded server-generated report.',
    })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const upstream = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(upstream).toMatchObject(FUTURE_REPORT_DEEPSEEK_POLICY)
    expect(Object.keys(upstream).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'stream',
      'temperature',
    ])
    expect(upstream.messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('GROUND EVERYTHING IN THE CHART FACTS'),
      }),
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Server-owned natal chart facts.'),
      }),
    ])
    expect(mocks.claimPurchase).toHaveBeenCalledWith(
      PURCHASE_ID,
      USER_ID,
      STARTED_AT,
    )
    expect(mocks.saveReport).toHaveBeenCalledWith(
      PURCHASE_ID,
      STARTED_AT,
      'A bounded server-generated report.',
      COMPLETED_AT,
    )
    expect(mocks.failGeneration).not.toHaveBeenCalled()
  })

  it('bounds a fetch that never settles even when it ignores abort', async () => {
    vi.useFakeTimers()
    const mocks = createStore()
    let fetchStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve
    })
    const fetchImpl = vi.fn(() => {
      fetchStarted?.()
      return new Promise<Response>(() => undefined)
    })
    const pending = handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl,
      deepSeekDeadlineMs: 45,
    })

    await started
    await vi.advanceTimersByTimeAsync(46)
    const response = await pending

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'REPORT_GENERATION_TIMEOUT',
    })
    expect(mocks.failGeneration).toHaveBeenCalledWith(
      PURCHASE_ID,
      STARTED_AT,
      expect.any(AbortSignal),
    )
    expect(mocks.saveReport).not.toHaveBeenCalled()
  })

  it('bounds a response reader that never settles and cancels it', async () => {
    vi.useFakeTimers()
    const mocks = createStore()
    const cancel = vi.fn()
    let readerStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      readerStarted = resolve
    })
    const body = new ReadableStream<Uint8Array>({
      pull() {
        readerStarted?.()
        return new Promise(() => undefined)
      },
      cancel,
    })
    const pending = handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(new Response(body, {
        headers: { 'Content-Type': 'application/json' },
      })),
      deepSeekDeadlineMs: 45,
    })

    await started
    await vi.advanceTimersByTimeAsync(46)
    const response = await pending

    expect(response.status).toBe(503)
    expect(cancel).toHaveBeenCalled()
    expect(mocks.failGeneration).toHaveBeenCalledOnce()
    expect(mocks.saveReport).not.toHaveBeenCalled()
  })

  it('links request abort to DeepSeek but uses an independent cleanup signal', async () => {
    const mocks = createStore()
    const requestController = new AbortController()
    let upstreamSignal: AbortSignal | undefined
    let fetchStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve
    })
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined
      fetchStarted?.()
      return new Promise<Response>(() => undefined)
    })
    const pending = handleFutureReportGenerate(
      request(requestController.signal),
      {
        ...baseDependencies(mocks.store),
        fetchImpl,
      },
    )

    await started
    requestController.abort(new DOMException('client left', 'AbortError'))
    const response = await pending

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'REPORT_GENERATION_INTERRUPTED',
    })
    expect(upstreamSignal?.aborted).toBe(true)
    const cleanupSignal = mocks.failGeneration.mock.calls[0]?.[2] as AbortSignal
    expect(cleanupSignal).not.toBe(requestController.signal)
    expect(cleanupSignal.aborted).toBe(false)
  })

  it('rejects an oversized streamed JSON body and marks the exact claim failed', async () => {
    const mocks = createStore()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(512 * 1_024 + 1))
        controller.close()
      },
    })
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(new Response(body, {
        headers: { 'Content-Type': 'application/json' },
      })),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      code: 'REPORT_GENERATION_INVALID_RESPONSE',
    })
    expect(mocks.failGeneration).toHaveBeenCalledWith(
      PURCHASE_ID,
      STARTED_AT,
      expect.any(AbortSignal),
    )
    expect(mocks.saveReport).not.toHaveBeenCalled()
  })

  it.each([
    ['non-JSON media type', new Response('<html>secret</html>', {
      headers: { 'Content-Type': 'text/html' },
    })],
    ['invalid JSON', new Response('{"choices":', {
      headers: { 'Content-Type': 'application/json' },
    })],
    ['invalid payload', new Response('{"choices":[]}', {
      headers: { 'Content-Type': 'application/json' },
    })],
    ['overlong report', jsonCompletion('x'.repeat(100_001))],
  ])('rejects %s without exposing upstream content', async (_label, upstream) => {
    const mocks = createStore()
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(upstream),
    })
    const text = await response.text()

    expect(response.status).toBe(502)
    expect(text).toContain('REPORT_GENERATION_INVALID_RESPONSE')
    expect(text).not.toContain('secret')
    expect(mocks.failGeneration).toHaveBeenCalledOnce()
    expect(mocks.saveReport).not.toHaveBeenCalled()
  })

  it.each([
    [401, 502, 'REPORT_GENERATION_UPSTREAM_FAILED'],
    [429, 503, 'REPORT_GENERATION_UPSTREAM_UNAVAILABLE'],
    [500, 503, 'REPORT_GENERATION_UPSTREAM_UNAVAILABLE'],
  ])(
    'maps upstream %s safely without reading its body',
    async (status, expectedStatus, code) => {
      const mocks = createStore()
      const cancel = vi.fn()
      const upstream = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('vendor secret'))
        },
        cancel,
      }), { status })
      const response = await handleFutureReportGenerate(request(), {
        ...baseDependencies(mocks.store),
        fetchImpl: vi.fn().mockResolvedValue(upstream),
      })
      const text = await response.text()

      expect(response.status).toBe(expectedStatus)
      expect(text).toContain(code)
      expect(text).not.toContain('vendor secret')
      expect(cancel).toHaveBeenCalled()
      expect(mocks.failGeneration).toHaveBeenCalledOnce()
    },
  )

  it('maps a network failure safely and marks the claim failed', async () => {
    const mocks = createStore()
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockRejectedValue(new Error('vendor DNS secret')),
    })
    const text = await response.text()

    expect(response.status).toBe(502)
    expect(text).toContain('REPORT_GENERATION_UPSTREAM_FAILED')
    expect(text).not.toContain('DNS')
    expect(mocks.failGeneration).toHaveBeenCalledOnce()
  })
})

describe('paid Future Report failure recovery', () => {
  it('bounds a never-resolving failure cleanup without replacing the original error', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mocks = createStore()
    let cleanupStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      cleanupStarted = resolve
    })
    mocks.failGeneration.mockImplementation(() => {
      cleanupStarted?.()
      return new Promise<void>(() => undefined)
    })
    const pending = handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      cleanupDeadlineMs: 7,
    })

    await started
    await vi.advanceTimersByTimeAsync(8)
    const response = await pending

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'REPORT_GENERATION_UPSTREAM_UNAVAILABLE',
    })
    const cleanupSignal = mocks.failGeneration.mock.calls[0]?.[2] as AbortSignal
    expect(cleanupSignal.aborted).toBe(true)
    expect(consoleError.mock.calls.flat().join(' ')).toContain(
      'future_report_generation_failure_cleanup_failed',
    )
  })

  it('logs only a stable event when failure cleanup throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mocks = createStore()
    mocks.failGeneration.mockRejectedValue(new Error('private database detail'))
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    })

    expect(response.status).toBe(503)
    const log = consoleError.mock.calls.flat().join(' ')
    expect(log).toContain('future_report_generation_failure_cleanup_failed')
    expect(log).not.toContain('private database detail')
    expect(log).not.toContain(PURCHASE_ID)
  })

  it('marks a claimed row failed when its returned snapshot is invalid', async () => {
    const mocks = createStore()
    mocks.claimPurchase.mockResolvedValue({
      ...purchase,
      generation_status: 'generating',
      generation_started_at: STARTED_AT,
      generation_attempt_count: 1,
      generation_input: null,
    })
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn(),
    })

    expect(response.status).toBe(409)
    expect(mocks.failGeneration).toHaveBeenCalledWith(
      PURCHASE_ID,
      STARTED_AT,
      expect.any(AbortSignal),
    )
  })

  it('marks a failed report-save CAS and never reports success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mocks = createStore()
    mocks.saveReport.mockRejectedValue(new Error('save CAS returned zero rows'))
    const response = await handleFutureReportGenerate(request(), {
      ...baseDependencies(mocks.store),
      fetchImpl: vi.fn().mockResolvedValue(jsonCompletion()),
    })

    expect(response.status).toBe(500)
    expect(mocks.failGeneration).toHaveBeenCalledWith(
      PURCHASE_ID,
      STARTED_AT,
      expect.any(AbortSignal),
    )
  })
})
