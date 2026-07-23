import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBestEffortSubscribeRateLimiter,
  handleSubscribe,
  type SubscribeRateLimiter,
} from '../api/subscribe'
import { subscribeEmail } from '../src/lib/subscribe'

const APP_ORIGIN = 'https://cinnabar.example'
const WEBHOOK_URL = 'https://hook.us1.make.com/make/capture?flow=public'
const NOW = new Date('2026-07-23T12:00:00.000Z')

let limiter: SubscribeRateLimiter

function request(
  body: unknown,
  options: {
    method?: string
    origin?: string
    fetchSite?: string
    contentType?: string
    ip?: string | null
    signal?: AbortSignal
    rawBody?: string
    contentLength?: string
    url?: string
  } = {},
): Request {
  const headers = new Headers({
    Origin: options.origin ?? APP_ORIGIN,
    'Sec-Fetch-Site': options.fetchSite ?? 'same-origin',
    'Content-Type': options.contentType ?? 'application/json',
  })
  if (options.ip !== null) {
    headers.set('x-forwarded-for', options.ip ?? '203.0.113.7')
  }
  if (options.contentLength !== undefined) {
    headers.set('Content-Length', options.contentLength)
  }
  return new Request(options.url ?? `${APP_ORIGIN}/api/subscribe`, {
    method: options.method ?? 'POST',
    headers,
    body: (options.method ?? 'POST') === 'GET'
      ? undefined
      : options.rawBody ?? JSON.stringify(body),
    signal: options.signal,
  })
}

function streamingRequest(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Request {
  return new Request(`${APP_ORIGIN}/api/subscribe`, {
    method: 'POST',
    headers: {
      Origin: APP_ORIGIN,
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
    },
    body,
    signal,
    duplex: 'half',
  } as RequestInit)
}

function successResponse(cancel = vi.fn()): {
  response: Response
  cancel: ReturnType<typeof vi.fn>
} {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('ignored success body'))
    },
    cancel,
  })
  return {
    response: new Response(body, { status: 202 }),
    cancel,
  }
}

function dependencies(fetchImpl: typeof fetch) {
  return {
    fetchImpl,
    limiter,
    now: () => NOW,
  }
}

beforeEach(() => {
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.MAKE_WEBHOOK_URL = WEBHOOK_URL
  limiter = createBestEffortSubscribeRateLimiter()
})

afterEach(() => {
  delete process.env.APP_ORIGIN
  delete process.env.MAKE_WEBHOOK_URL
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('subscription request boundary', () => {
  it('is POST-only with stable no-store headers', async () => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(
      request(null, { method: 'GET' }),
      dependencies(fetchImpl),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'method_not_allowed',
        message: 'Method Not Allowed',
      },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['missing media type', ''],
    ['plain text', 'text/plain'],
    ['JSON with a parameter', 'application/json; charset=utf-8'],
    ['case variant', 'Application/JSON'],
  ])('rejects %s because the media type must be exact', async (_label, contentType) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { contentType }), dependencies(fetchImpl))

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unsupported_media_type' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['array', []],
    ['missing source', { email: 'user@example.com' }],
    ['missing email', { source: 'reading' }],
    ['extra prompt', {
      email: 'user@example.com',
      source: 'reading',
      prompt: 'attacker controlled',
    }],
    ['legacy messages', {
      email: 'user@example.com',
      source: 'reading',
      messages: [],
    }],
  ])('rejects the non-exact root schema: %s', async (_label, body) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(
      request(body),
      dependencies(fetchImpl),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_request' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['reading', 'soul_card', 'exit_intent'])(
    'accepts the real source allowlist value %s',
    async (source) => {
      const { response: upstream } = successResponse()
      const fetchImpl = vi.fn().mockResolvedValue(upstream)
      const response = await handleSubscribe(request({
        email: 'user@example.com',
        source,
      }), dependencies(fetchImpl))

      expect(response.status).toBe(200)
    },
  )

  it.each([
    'unknown',
    'Reading',
    ' reading',
    'soul-card',
    '',
    7,
  ])('rejects a source outside the exact allowlist: %s', async (source) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source,
    }), dependencies(fetchImpl))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_source' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('normalizes email and sends only the server-owned webhook shape', async () => {
    const { response: upstream } = successResponse()
    const fetchImpl = vi.fn().mockResolvedValue(upstream)
    const response = await handleSubscribe(request({
      email: '  User.Name+TAG@Example.COM  ',
      source: 'soul_card',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'user.name+tag@example.com',
      source: 'soul_card',
      created_at: NOW.toISOString(),
    })
  })

  it.each([
    ['missing address', ''],
    ['bad syntax', 'not-an-email'],
    ['embedded space', 'a b@example.com'],
    ['control character', 'user@example.com\n'],
    ['too long', `${'a'.repeat(248)}@x.test`],
  ])('rejects invalid email input: %s', async (_label, email) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email,
      source: 'reading',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_email' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts 254 characters but rejects 255 characters', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    const accepted = await handleSubscribe(request({
      email: `${'a'.repeat(247)}@x.test`,
      source: 'reading',
    }), dependencies(fetchImpl))
    const rejected = await handleSubscribe(request({
      email: `${'a'.repeat(248)}@x.test`,
      source: 'reading',
    }), dependencies(fetchImpl))

    expect(accepted.status).toBe(200)
    expect(rejected.status).toBe(400)
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'invalid_email' },
    })
  })

  it('enforces the streamed byte limit without trusting Content-Length', async () => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request(null, {
      rawBody: JSON.stringify({ padding: '界'.repeat(800) }),
    }), dependencies(fetchImpl))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'request_too_large' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['oversized declaration', '2049', 413, 'request_too_large'],
    ['non-canonical declaration', '2e3', 400, 'invalid_request'],
    ['negative declaration', '-1', 400, 'invalid_request'],
  ])(
    'rejects %s in Content-Length',
    async (_label, contentLength, status, code) => {
      const fetchImpl = vi.fn()
      const response = await handleSubscribe(request({
        email: 'user@example.com',
        source: 'reading',
      }, { contentLength }), dependencies(fetchImpl))

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toMatchObject({
        error: { code },
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('times out and cancels a request-body read that never settles', async () => {
    vi.useFakeTimers()
    let readStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      readStarted = resolve
    })
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull() {
        readStarted?.()
        return new Promise<void>(() => undefined)
      },
      cancel,
    })
    const fetchImpl = vi.fn()
    const pending = handleSubscribe(streamingRequest(body), {
      ...dependencies(fetchImpl),
      bodyReadDeadlineMs: 10,
    })

    await started
    await vi.advanceTimersByTimeAsync(11)
    const response = await pending

    expect(response.status).toBe(408)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'request_timeout',
        message: 'Subscription request timed out.',
      },
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('links request abort to a pending body read and cancels the reader', async () => {
    const controller = new AbortController()
    let readStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      readStarted = resolve
    })
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull() {
        readStarted?.()
        return new Promise<void>(() => undefined)
      },
      cancel,
    })
    const fetchImpl = vi.fn()
    const pending = handleSubscribe(
      streamingRequest(body, controller.signal),
      dependencies(fetchImpl),
    )

    await started
    controller.abort(new DOMException('client left', 'AbortError'))
    const response = await pending

    expect(response.status).toBe(499)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'request_aborted' },
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('subscription origin and configuration boundary', () => {
  it.each([
    ['wrong origin', 'https://attacker.example', 'same-origin'],
    ['cross-site metadata', APP_ORIGIN, 'cross-site'],
    ['missing fetch metadata', APP_ORIGIN, ''],
  ])('rejects %s', async (_label, origin, fetchSite) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { origin, fetchSite }), dependencies(fetchImpl))

    expect(response.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows exact http://localhost development origin only', async () => {
    process.env.APP_ORIGIN = 'http://localhost:5173'
    const { response: upstream } = successResponse()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, {
      origin: 'http://localhost:5173',
      url: 'http://localhost:5173/api/subscribe',
    }), dependencies(vi.fn().mockResolvedValue(upstream)))

    expect(response.status).toBe(200)
  })

  it.each([
    ['missing APP_ORIGIN', 'APP_ORIGIN', undefined],
    ['missing webhook', 'MAKE_WEBHOOK_URL', undefined],
    ['remote HTTP webhook', 'MAKE_WEBHOOK_URL', 'http://hook.eu1.make.com/path'],
    ['webhook credentials', 'MAKE_WEBHOOK_URL', 'https://user:pass@hook.eu1.make.com/path'],
    ['webhook fragment', 'MAKE_WEBHOOK_URL', 'https://hook.eu1.make.com/path#secret'],
    ['wrong webhook protocol', 'MAKE_WEBHOOK_URL', 'ftp://hook.eu1.make.com/path'],
    ['arbitrary HTTPS host', 'MAKE_WEBHOOK_URL', 'https://webhook.example.test/path'],
    ['Make lookalike', 'MAKE_WEBHOOK_URL', 'https://hook.us1.make.com.evil.test/path'],
    ['RFC1918 address', 'MAKE_WEBHOOK_URL', 'https://10.0.0.7/path'],
    ['metadata address', 'MAKE_WEBHOOK_URL', 'https://169.254.169.254/latest/meta-data'],
    ['private IPv6 address', 'MAKE_WEBHOOK_URL', 'https://[fd00::1]/path'],
    ['loopback HTTPS address', 'MAKE_WEBHOOK_URL', 'https://[::1]/path'],
    ['non-default Make port', 'MAKE_WEBHOOK_URL', 'https://hook.eu1.make.com:8443/path'],
  ])('fails closed for %s', async (_label, variable, value) => {
    if (value === undefined) delete process.env[variable]
    else process.env[variable] = value
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'subscription_unavailable' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    'https://hook.make.com/hooks/capture?token=global',
    'https://hook.us1.make.com/hooks/capture?token=us',
    'https://hook.us2.make.com/hooks/capture?token=us',
    'https://hook.eu1.make.com/hooks/capture?token=eu',
    'https://hook.eu2.make.com/hooks/capture?token=eu',
    'https://hook.ap1.make.com/hooks/capture?token=ap',
  ])('allows an official Make webhook origin: %s', async (webhookUrl) => {
    process.env.MAKE_WEBHOOK_URL = webhookUrl
    const { response: upstream } = successResponse()
    const fetchImpl = vi.fn().mockResolvedValue(upstream)
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(200)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(webhookUrl)
  })

  it.each([
    'http://localhost:9000/hooks/capture?token=local',
    'http://127.0.0.1:9000/hooks/capture?token=local',
    'http://[::1]:9000/hooks/capture?token=local',
  ])('allows an explicit HTTP loopback webhook: %s', async (webhookUrl) => {
    process.env.APP_ORIGIN = 'http://localhost:5173'
    process.env.MAKE_WEBHOOK_URL = webhookUrl
    const { response: upstream } = successResponse()
    const fetchImpl = vi.fn().mockResolvedValue(upstream)
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, {
      origin: 'http://localhost:5173',
      url: 'http://localhost:5173/api/subscribe',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(200)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(webhookUrl)
  })

  it('rejects a local HTTP webhook in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.APP_ORIGIN = 'http://localhost:5173'
    process.env.MAKE_WEBHOOK_URL = 'http://127.0.0.1:9000/hooks/capture'
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, {
      origin: 'http://localhost:5173',
      url: 'http://localhost:5173/api/subscribe',
    }), dependencies(fetchImpl))

    expect(response.status).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('subscription IP and best-effort rate boundary', () => {
  it.each([
    ['IPv4', '203.0.113.7'],
    ['IPv6', '2001:0db8:0:0:0:0:0:1'],
  ])('accepts and normalizes a single Vercel %s value', async (_label, ip) => {
    const { response: upstream } = successResponse()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip }), dependencies(vi.fn().mockResolvedValue(upstream)))
    expect(response.status).toBe(200)
  })

  it.each([
    '203.0.113.7, 10.0.0.1',
    '203.0.113.007',
    '999.0.0.1',
    'not-an-ip',
    'fe80::1%eth0',
    'x'.repeat(65),
  ])('rejects a forged or non-single XFF value: %s', async (ip) => {
    const fetchImpl = vi.fn()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip }), dependencies(fetchImpl))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_client_ip' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('limits each IP independently with Retry-After', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    for (let index = 0; index < 5; index += 1) {
      const response = await handleSubscribe(request({
        email: 'user@example.com',
        source: 'reading',
      }), dependencies(fetchImpl))
      expect(response.status).toBe(200)
    }
    const limited = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }), dependencies(fetchImpl))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    expect(limited.headers.get('Cache-Control')).toBe('no-store')

    const otherIp = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip: '203.0.113.8' }), dependencies(fetchImpl))
    expect(otherIp.status).toBe(200)
  })

  it('uses a separate smaller fallback bucket when Vercel IP is unavailable', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    for (let index = 0; index < 2; index += 1) {
      const response = await handleSubscribe(request({
        email: 'user@example.com',
        source: 'reading',
      }, { ip: null }), dependencies(fetchImpl))
      expect(response.status).toBe(200)
    }
    const limited = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip: null }), dependencies(fetchImpl))
    expect(limited.status).toBe(429)

    const knownIp = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip: '203.0.113.9' }), dependencies(fetchImpl))
    expect(knownIp.status).toBe(200)
  })

  it('bounds rotating IPs with a warm-isolate global window', () => {
    const bounded = createBestEffortSubscribeRateLimiter({
      perIpMax: 10,
      fallbackMax: 1,
      globalMax: 3,
      windowMs: 60_000,
    })

    for (let index = 1; index <= 3; index += 1) {
      expect(bounded.consume({
        key: `ip:203.0.113.${index}`,
        fallback: false,
      }, NOW.getTime()).allowed).toBe(true)
    }
    expect(bounded.consume({
      key: 'ip:203.0.113.4',
      fallback: false,
    }, NOW.getTime())).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })

  it('does not let one rejected IP exhaust the global allowance', () => {
    const bounded = createBestEffortSubscribeRateLimiter({
      perIpMax: 1,
      fallbackMax: 1,
      globalMax: 2,
      windowMs: 60_000,
    })

    expect(bounded.consume({
      key: 'ip:203.0.113.1',
      fallback: false,
    }, NOW.getTime()).allowed).toBe(true)
    for (let index = 0; index < 100; index += 1) {
      expect(bounded.consume({
        key: 'ip:203.0.113.1',
        fallback: false,
      }, NOW.getTime()).allowed).toBe(false)
    }
    expect(bounded.consume({
      key: 'ip:203.0.113.2',
      fallback: false,
    }, NOW.getTime()).allowed).toBe(true)
  })

  it('uses one overflow bucket when the warm-isolate map is saturated', () => {
    const bounded = createBestEffortSubscribeRateLimiter({
      perIpMax: 10,
      fallbackMax: 1,
      globalMax: 100,
      maxBuckets: 2,
    })

    expect(bounded.consume({
      key: 'ip:203.0.113.1',
      fallback: false,
    }, NOW.getTime()).allowed).toBe(true)
    expect(bounded.consume({
      key: 'ip:203.0.113.2',
      fallback: false,
    }, NOW.getTime()).allowed).toBe(true)
    expect(bounded.consume({
      key: 'ip:203.0.113.3',
      fallback: false,
    }, NOW.getTime()).allowed).toBe(false)
  })

  it('does not charge an invalid body to the shared global allowance', async () => {
    limiter = createBestEffortSubscribeRateLimiter({
      perIpMax: 5,
      fallbackMax: 1,
      globalMax: 1,
    })
    const fetchImpl = vi.fn(() => Promise.resolve(
      new Response(null, { status: 204 }),
    ))
    const invalid = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'attacker',
    }), dependencies(fetchImpl))
    const valid = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { ip: '203.0.113.8' }), dependencies(fetchImpl))

    expect(invalid.status).toBe(400)
    expect(valid.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('subscription webhook reliability and secrecy', () => {
  it('bounds a fetch that never settles even when it ignores abort', async () => {
    vi.useFakeTimers()
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
    const pending = handleSubscribe(request({
      email: 'secret.person@example.com',
      source: 'reading',
    }), {
      ...dependencies(fetchImpl),
      webhookDeadlineMs: 10,
    })

    await started
    await vi.advanceTimersByTimeAsync(11)
    const response = await pending

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'webhook_timeout' },
    })
    expect(upstreamSignal?.aborted).toBe(true)
  })

  it('bounds a webhook response-body cancel that never settles', async () => {
    vi.useFakeTimers()
    let cancelStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      cancelStarted = resolve
    })
    const upstream = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
      },
      cancel() {
        cancelStarted?.()
        return new Promise(() => undefined)
      },
    }), { status: 202 })
    const pending = handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }), {
      ...dependencies(vi.fn().mockResolvedValue(upstream)),
      webhookDeadlineMs: 10,
    })

    await started
    await vi.advanceTimersByTimeAsync(11)
    const response = await pending
    expect(response.status).toBe(504)
  })

  it('links request abort to the upstream request and remains bounded', async () => {
    const controller = new AbortController()
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
    const pending = handleSubscribe(request({
      email: 'user@example.com',
      source: 'reading',
    }, { signal: controller.signal }), dependencies(fetchImpl))

    await started
    controller.abort(new DOMException('client left', 'AbortError'))
    const response = await pending

    expect(response.status).toBe(499)
    expect(upstreamSignal?.aborted).toBe(true)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'request_aborted' },
    })
  })

  it.each([302, 400, 429, 500])(
    'maps webhook %s safely without reading or leaking its body',
    async (status) => {
      const cancel = vi.fn()
      const upstream = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'vendor secret user@example.com 203.0.113.7',
          ))
        },
        cancel,
      }), { status })
      const response = await handleSubscribe(request({
        email: 'user@example.com',
        source: 'reading',
      }), dependencies(vi.fn().mockResolvedValue(upstream)))
      const text = await response.text()

      expect(response.status).toBe(502)
      expect(text).toContain('webhook_unavailable')
      expect(text).not.toContain('vendor secret')
      expect(text).not.toContain('user@example.com')
      expect(text).not.toContain('203.0.113.7')
      expect(text).not.toContain(WEBHOOK_URL)
      expect(cancel).toHaveBeenCalled()
    },
  )

  it('maps network failures safely without logging secrets', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await handleSubscribe(request({
      email: 'secret.person@example.com',
      source: 'reading',
    }), dependencies(vi.fn().mockRejectedValue(
      new Error(`vendor ${WEBHOOK_URL} 203.0.113.7 secret.person@example.com`),
    )))
    const text = await response.text()

    expect(response.status).toBe(502)
    expect(text).not.toContain('secret.person')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('accepts any 2xx response and promptly cancels its body', async () => {
    const { response: upstream, cancel } = successResponse()
    const response = await handleSubscribe(request({
      email: 'user@example.com',
      source: 'exit_intent',
    }), dependencies(vi.fn().mockResolvedValue(upstream)))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('subscription browser helper', () => {
  it('normalizes email and forwards an AbortSignal', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await subscribeEmail(
      '  User@Example.COM  ',
      'reading',
      controller.signal,
    )

    expect(fetchMock).toHaveBeenCalledWith('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        source: 'reading',
      }),
      signal: controller.signal,
    })
  })

  it('reads the stable nested server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Please try again shortly.',
      },
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(subscribeEmail('user@example.com', 'reading'))
      .rejects.toThrow('Too many requests. Please try again shortly.')
  })
})
