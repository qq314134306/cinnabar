import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  handlePublicReading,
  PUBLIC_READING_POLICIES,
} from '../api/_public-reading'
import { getSupabaseAdmin } from '../api/_supabase-admin'

vi.mock('../api/_supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}))

const APP_ORIGIN = 'https://cinnabar.example'
const NOW = new Date('2026-07-23T12:00:00.000Z')
const HMAC_KEY = 'A'.repeat(43)

const FULL_BIRTH = {
  year: 1990,
  month: 1,
  day: 15,
  hour: 10,
  gender: 'female',
  trueSolarEnabled: false,
  birthTimeReliable: true,
} as const

const BASIC_BIRTH_A = {
  year: 1988,
  month: 5,
  day: 20,
  hour: 8,
  gender: 'male',
} as const

const BASIC_BIRTH_B = {
  year: 1991,
  month: 9,
  day: 2,
  hour: 14,
  gender: 'female',
} as const

const COMPATIBILITY_BIRTH_A = {
  ...BASIC_BIRTH_A,
  birthplace: 'New York',
  trueSolarEnabled: true,
  birthTimeReliable: true,
} as const

const COMPATIBILITY_BIRTH_B = {
  ...BASIC_BIRTH_B,
  trueSolarEnabled: true,
  birthTimeReliable: true,
} as const

const VALID_BODIES = {
  natal: {
    version: 'reading.v1',
    operation: 'natal',
    persona: 'scholar',
    birth: FULL_BIRTH,
  },
  compatibility: {
    version: 'reading.v1',
    operation: 'compatibility',
    persona: 'sage',
    personA: COMPATIBILITY_BIRTH_A,
    personB: COMPATIBILITY_BIRTH_B,
  },
  yearly: {
    version: 'reading.v1',
    operation: 'yearly',
    persona: 'scholar',
    birth: FULL_BIRTH,
    year: 2026,
  },
} as const

function request(
  body: unknown,
  options: {
    method?: string
    origin?: string
    fetchSite?: string
    contentType?: string
    ip?: string
    signal?: AbortSignal
    rawBody?: string
  } = {},
): Request {
  return new Request(`${APP_ORIGIN}/api/interpret`, {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? APP_ORIGIN,
      'Sec-Fetch-Site': options.fetchSite ?? 'same-origin',
      'Content-Type': options.contentType ?? 'application/json',
      'x-forwarded-for': options.ip ?? '203.0.113.7',
    },
    body: (options.method ?? 'POST') === 'GET'
      ? undefined
      : options.rawBody ?? JSON.stringify(body),
    signal: options.signal,
  })
}

function sseResponse(
  value = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
): Response {
  return new Response(value, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

function allowedQuota() {
  return Promise.resolve({ allowed: true, retryAfterSeconds: 42 })
}

beforeEach(() => {
  process.env.ENABLE_PUBLIC_AI_READINGS = 'true'
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.DEEPSEEK_API_KEY = 'server-only-deepseek-key'
  process.env.PUBLIC_AI_QUOTA_HMAC_KEY = HMAC_KEY
  process.env.PUBLIC_AI_DAILY_IP_LIMIT = '3'
  process.env.PUBLIC_AI_DAILY_GLOBAL_LIMIT = '100'
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
  process.env.SUPABASE_SECRET_KEY = 'service-role-secret'
  vi.clearAllMocks()
})

afterEach(() => {
  delete process.env.ENABLE_PUBLIC_AI_READINGS
  delete process.env.APP_ORIGIN
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.PUBLIC_AI_QUOTA_HMAC_KEY
  delete process.env.PUBLIC_AI_DAILY_IP_LIMIT
  delete process.env.PUBLIC_AI_DAILY_GLOBAL_LIMIT
  delete process.env.VITE_SUPABASE_URL
  delete process.env.SUPABASE_SECRET_KEY
  vi.useRealTimers()
})

describe('public reading server authority', () => {
  it.each([
    ['natal', VALID_BODIES.natal],
    ['compatibility', VALID_BODIES.compatibility],
    ['yearly', VALID_BODIES.yearly],
  ] as const)(
    'builds both %s upstream messages on the server with a fixed policy',
    async (operation, body) => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse())
      const response = await handlePublicReading(request(body), {
        now: () => NOW,
        claimQuota: allowedQuota,
        fetchImpl,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'text/event-stream; charset=utf-8',
      )
      expect(response.headers.get('Cache-Control')).toContain('no-store')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      await expect(response.text()).resolves.toContain('"content":"ok"')

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
      const upstream = JSON.parse(String(init.body)) as Record<string, unknown>
      const messages = upstream.messages as Array<Record<string, unknown>>
      expect(upstream).toMatchObject(PUBLIC_READING_POLICIES[operation])
      expect(Object.keys(upstream).sort()).toEqual([
        'max_tokens',
        'messages',
        'model',
        'stream',
        'temperature',
      ])
      expect(messages).toHaveLength(2)
      expect(messages.map((message) => message.role)).toEqual(['system', 'user'])
      expect(messages[0]?.content).toContain('GROUND EVERYTHING IN THE CHART FACTS')
      expect(messages[1]?.content).toContain('FACTS')

      if (operation === 'compatibility') {
        expect(messages[1]?.content).toContain('PERSON A')
        expect(messages[1]?.content).toContain('PERSON B')
      }
      if (operation === 'yearly') {
        expect(messages[1]?.content).toContain('SERVER-GENERATED 2026 YEARLY FACTS')
      }
    },
  )

  it('accepts legacy five-field compatibility people during rolling deployment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse())
    const response = await handlePublicReading(request({
      ...VALID_BODIES.compatibility,
      personA: BASIC_BIRTH_A,
      personB: BASIC_BIRTH_B,
    }), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
    })

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('"content":"ok"')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('accepts a compatibility birthplace while solar correction is disabled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse())
    const response = await handlePublicReading(request({
      ...VALID_BODIES.compatibility,
      personA: {
        ...COMPATIBILITY_BIRTH_A,
        trueSolarEnabled: false,
      },
    }), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
    })

    expect(response.status).toBe(200)
    await response.text()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('uses only purpose-separated HMAC subjects in the service-role RPC', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 60 },
      error: null,
    })
    const builder = {
      abortSignal: vi.fn(),
      single,
    }
    builder.abortSignal.mockReturnValue(builder)
    const rpc = vi.fn().mockReturnValue(builder)
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      rpc,
    } as unknown as SupabaseClient)
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse())

    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      fetchImpl,
    })
    await response.text()

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledOnce()
    expect(builder.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(rpc.mock.calls[0]?.[0]).toBe('claim_public_ai_daily_quota')
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args).toMatchObject({
      p_global_limit: 100,
      p_ip_limit: 3,
    })
    expect(args.p_global_subject_hash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(args.p_ip_subject_hash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(args.p_global_subject_hash).not.toBe(args.p_ip_subject_hash)
    expect(JSON.stringify(args)).not.toContain('203.0.113.7')
  })
})

describe('public reading rejection boundary', () => {
  it.each([
    [
      'browser messages',
      { ...VALID_BODIES.natal, messages: [{ role: 'system', content: 'attack' }] },
      400,
    ],
    ['root extra key', { ...VALID_BODIES.natal, extra: true }, 400],
    [
      'nested extra key',
      { ...VALID_BODIES.natal, birth: { ...FULL_BIRTH, facts: 'attack' } },
      400,
    ],
    [
      'compatibility nested extra key',
      {
        ...VALID_BODIES.compatibility,
        personA: { ...COMPATIBILITY_BIRTH_A, facts: 'attack' },
      },
      400,
    ],
    [
      'compatibility missing solar setting',
      {
        ...VALID_BODIES.compatibility,
        personA: BASIC_BIRTH_A,
        personB: {
          ...BASIC_BIRTH_B,
          birthTimeReliable: true,
        },
      },
      400,
    ],
    [
      'mixed legacy and full compatibility people',
      {
        ...VALID_BODIES.compatibility,
        personA: BASIC_BIRTH_A,
        personB: COMPATIBILITY_BIRTH_B,
      },
      400,
    ],
    [
      'minor natal subject',
      { ...VALID_BODIES.natal, birth: { ...FULL_BIRTH, year: 2014 } },
      403,
    ],
    [
      'minor compatibility subject',
      {
        ...VALID_BODIES.compatibility,
        personB: { ...COMPATIBILITY_BIRTH_B, year: 2015 },
      },
      403,
    ],
    ['year below allowlist', { ...VALID_BODIES.yearly, year: 2020 }, 400],
    ['year above allowlist', { ...VALID_BODIES.yearly, year: 2031 }, 400],
  ] as const)('rejects %s without upstream fetch', async (_label, body, status) => {
    const fetchImpl = vi.fn()
    const response = await handlePublicReading(request(body), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
    })

    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a non-exact compatibility birthplace before provider fetch', async () => {
    const fetchImpl = vi.fn()
    const response = await handlePublicReading(request({
      ...VALID_BODIES.compatibility,
      personA: {
        ...COMPATIBILITY_BIRTH_A,
        birthplace: 'New Y',
      },
    }), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
    })

    expect(response.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong origin', { origin: 'https://attacker.example' }, 403],
    ['cross-site fetch', { fetchSite: 'cross-site' }, 403],
    ['wrong content type', { contentType: 'text/plain' }, 415],
    ['missing client IP', { ip: '' }, 400],
    ['forwarded IP chain', { ip: '203.0.113.7, 10.0.0.1' }, 400],
  ] as const)('rejects %s before upstream fetch', async (_label, options, status) => {
    const fetchImpl = vi.fn()
    const response = await handlePublicReading(
      request(VALID_BODIES.natal, options),
      {
        now: () => NOW,
        claimQuota: allowedQuota,
        fetchImpl,
      },
    )
    expect(response.status).toBe(status)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('enforces a streamed byte cap instead of JavaScript character length', async () => {
    const fetchImpl = vi.fn()
    const response = await handlePublicReading(
      request(null, { rawBody: JSON.stringify({ padding: '界'.repeat(2_000) }) }),
      { claimQuota: allowedQuota, fetchImpl },
    )
    expect(response.status).toBe(413)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns POST-only Allow and stable no-store JSON', async () => {
    const response = await handlePublicReading(
      request(null, { method: 'GET' }),
      { fetchImpl: vi.fn() },
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'method_not_allowed',
        message: 'The reading request could not be completed.',
      },
    })
  })

  it.each([
    ['disabled', 'ENABLE_PUBLIC_AI_READINGS'],
    ['DeepSeek key missing', 'DEEPSEEK_API_KEY'],
    ['HMAC key missing', 'PUBLIC_AI_QUOTA_HMAC_KEY'],
    ['IP limit missing', 'PUBLIC_AI_DAILY_IP_LIMIT'],
    ['global limit missing', 'PUBLIC_AI_DAILY_GLOBAL_LIMIT'],
    ['APP_ORIGIN missing', 'APP_ORIGIN'],
    ['Supabase URL missing', 'VITE_SUPABASE_URL'],
    ['Supabase secret missing', 'SUPABASE_SECRET_KEY'],
  ])('fails closed when %s', async (_label, variable) => {
    delete process.env[variable]
    const fetchImpl = vi.fn()
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      fetchImpl,
      claimQuota: allowedQuota,
    })
    expect(response.status).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('claims quota before expensive chart/location rebuilding and never refunds', async () => {
    const fetchImpl = vi.fn()
    const claimQuota = vi.fn().mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 37,
    })
    const response = await handlePublicReading(request({
      ...VALID_BODIES.natal,
      birth: {
        ...FULL_BIRTH,
        birthplace: 'Definitely Not A Bundled Place',
        trueSolarEnabled: true,
      },
    }), {
      now: () => NOW,
      claimQuota,
      fetchImpl,
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('37')
    expect(claimQuota).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('honors an atomic Supabase RPC rejection with Retry-After and zero fetch', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { allowed: false, retry_after_seconds: 81 },
      error: null,
    })
    const builder = {
      abortSignal: vi.fn(),
      single,
    }
    builder.abortSignal.mockReturnValue(builder)
    const rpc = vi.fn().mockReturnValue(builder)
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      rpc,
    } as unknown as SupabaseClient)
    const fetchImpl = vi.fn()

    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      fetchImpl,
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('81')
    expect(rpc).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('times out a never-resolving quota RPC before any DeepSeek fetch', async () => {
    vi.useFakeTimers()
    let quotaSignalReady: (() => void) | undefined
    const signalReady = new Promise<void>((resolve) => {
      quotaSignalReady = resolve
    })
    const single = vi.fn(() => new Promise((_resolve, reject) => {
      quotaSignal?.addEventListener('abort', () => reject(quotaSignal?.reason))
    }))
    let quotaSignal: AbortSignal | undefined
    const builder = {
      abortSignal: vi.fn((signal: AbortSignal) => {
        quotaSignal = signal
        quotaSignalReady?.()
        return builder
      }),
      single,
    }
    const rpc = vi.fn().mockReturnValue(builder)
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      rpc,
    } as unknown as SupabaseClient)
    const fetchImpl = vi.fn()

    const pending = handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      fetchImpl,
    })
    await signalReady
    await vi.advanceTimersByTimeAsync(7_001)
    const response = await pending

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'quota_unavailable' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('links client abort to a pending quota RPC and performs zero DeepSeek fetches', async () => {
    const requestController = new AbortController()
    let quotaSignalReady: (() => void) | undefined
    const signalReady = new Promise<void>((resolve) => {
      quotaSignalReady = resolve
    })
    const single = vi.fn(() => new Promise((_resolve, reject) => {
      quotaSignal?.addEventListener('abort', () => reject(quotaSignal?.reason))
    }))
    let quotaSignal: AbortSignal | undefined
    const builder = {
      abortSignal: vi.fn((signal: AbortSignal) => {
        quotaSignal = signal
        quotaSignalReady?.()
        return builder
      }),
      single,
    }
    const rpc = vi.fn().mockReturnValue(builder)
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      rpc,
    } as unknown as SupabaseClient)
    const fetchImpl = vi.fn()

    const pending = handlePublicReading(
      request(VALID_BODIES.natal, { signal: requestController.signal }),
      {
        now: () => NOW,
        fetchImpl,
      },
    )
    await signalReady
    requestController.abort(new DOMException('client left', 'AbortError'))
    const response = await pending

    expect(response.status).toBe(499)
    expect(quotaSignal?.aborted).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('public reading upstream failure and cancellation', () => {
  it.each([
    [new Response('vendor secret table', { status: 400 }), 502, 'upstream_failed'],
    [new Response('vendor secret overload', { status: 429 }), 503, 'upstream_unavailable'],
    [new Response('vendor secret outage', { status: 500 }), 503, 'upstream_unavailable'],
    [
      new Response('<html>not SSE</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
      502,
      'upstream_failed',
    ],
  ] as const)('does not expose an upstream response body', async (upstream, status, code) => {
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl: vi.fn().mockResolvedValue(upstream),
    })
    const text = await response.text()
    expect(response.status).toBe(status)
    expect(text).toContain(`"code":"${code}"`)
    expect(text).not.toContain('vendor secret')
    expect(text).not.toContain('not SSE')
  })

  it('returns 504 when upstream headers exceed the fixed timeout', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    ))
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
      upstreamTimeoutMs: 5,
    })
    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'upstream_timeout' },
    })
  })

  it('does not refund a durable quota claim after an upstream failure', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 60 },
      error: null,
    })
    const builder = {
      abortSignal: vi.fn(),
      single,
    }
    builder.abortSignal.mockReturnValue(builder)
    const rpc = vi.fn().mockReturnValue(builder)
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      rpc,
    } as unknown as SupabaseClient)

    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      fetchImpl: vi.fn().mockResolvedValue(new Response('outage', { status: 500 })),
    })

    expect(response.status).toBe(503)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0]?.[0]).toBe('claim_public_ai_daily_quota')
  })

  it('links a request abort to the in-flight upstream request', async () => {
    const requestController = new AbortController()
    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        markFetchStarted?.()
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    ))
    const pending = handlePublicReading(
      request(VALID_BODIES.natal, { signal: requestController.signal }),
      {
        now: () => NOW,
        claimQuota: allowedQuota,
        fetchImpl,
        upstreamTimeoutMs: 1_000,
      },
    )
    await fetchStarted
    requestController.abort(new DOMException('client left', 'AbortError'))
    const response = await pending
    expect(response.status).toBe(499)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'request_aborted' },
    })
  })

  it('propagates downstream cancellation to the upstream SSE reader and signal', async () => {
    const upstreamCancel = vi.fn()
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'))
      },
      cancel: upstreamCancel,
    })
    let upstreamSignal: AbortSignal | null = null
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? null
      return Promise.resolve(new Response(upstreamBody, {
        headers: { 'Content-Type': 'text/event-stream' },
      }))
    })
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl,
      upstreamTimeoutMs: 1_000,
    })

    await response.body?.cancel('consumer left')
    expect(upstreamCancel).toHaveBeenCalledWith('consumer left')
    expect(upstreamSignal?.aborted).toBe(true)
  })

  it('uses an idle timeout, allowing a productive stream to exceed one interval', async () => {
    const encoder = new TextEncoder()
    let emitted = 0
    const upstreamBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 7))
        emitted += 1
        controller.enqueue(encoder.encode(`data: chunk-${emitted}\n\n`))
        if (emitted === 4) controller.close()
      },
    })
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl: vi.fn().mockResolvedValue(new Response(upstreamBody, {
        headers: { 'Content-Type': 'text/event-stream' },
      })),
      upstreamTimeoutMs: 15,
    })

    await expect(response.text()).resolves.toContain('chunk-4')
    expect(emitted).toBe(4)
  })

  it('cancels a stream that stops producing chunks for one idle interval', async () => {
    const upstreamCancel = vi.fn()
    const upstreamBody = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined)
      },
      cancel: upstreamCancel,
    })
    const response = await handlePublicReading(request(VALID_BODIES.natal), {
      now: () => NOW,
      claimQuota: allowedQuota,
      fetchImpl: vi.fn().mockResolvedValue(new Response(upstreamBody, {
        headers: { 'Content-Type': 'text/event-stream' },
      })),
      upstreamTimeoutMs: 5,
    })

    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(response.status).toBe(200)
    expect(upstreamCancel).toHaveBeenCalled()
  })
})
