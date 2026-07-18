import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/subscribe'

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://cinnabar.test/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// Give each test a unique client IP so the in-memory rate limiter never bleeds across cases.
let ipCounter = 0
function freshIp(): Record<string, string> {
  ipCounter += 1
  return { 'x-forwarded-for': `10.0.0.${ipCounter}` }
}

describe('api/subscribe', () => {
  beforeEach(() => {
    process.env.MAKE_WEBHOOK_URL = 'https://hook.make.test/abc'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.MAKE_WEBHOOK_URL
  })

  it('rejects non-POST methods', async () => {
    const res = await handler(new Request('https://cinnabar.test/api/subscribe', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects a missing email', async () => {
    const res = await handler(post({ source: 'reading' }, freshIp()))
    expect(res.status).toBe(400)
  })

  it('rejects an invalid email', async () => {
    const res = await handler(post({ email: 'not-an-email', source: 'reading' }, freshIp()))
    expect(res.status).toBe(400)
  })

  it('rejects an oversized body', async () => {
    const huge = JSON.stringify({ email: 'a@b.co', pad: 'x'.repeat(3000) })
    const res = await handler(post(huge, freshIp()))
    expect(res.status).toBe(413)
  })

  it('returns 500 when the webhook secret is not configured', async () => {
    delete process.env.MAKE_WEBHOOK_URL
    const res = await handler(post({ email: 'a@b.co', source: 'reading' }, freshIp()))
    expect(res.status).toBe(500)
  })

  it('forwards a valid email to the webhook and returns 200', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))

    const res = await handler(post({ email: '  User@Example.COM ', source: 'soul_card' }, freshIp()))
    expect(res.status).toBe(200)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hook.make.test/abc')
    const forwarded = JSON.parse((init as RequestInit).body as string)
    expect(forwarded.email).toBe('user@example.com') // normalized
    expect(forwarded.source).toBe('soul_card')
    expect(typeof forwarded.created_at).toBe('string')
    expect(Number.isNaN(Date.parse(forwarded.created_at))).toBe(false)
  })

  it('coerces an unknown source to "unknown"', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))

    await handler(post({ email: 'a@b.co', source: 'hacker' }, freshIp()))
    const forwarded = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(forwarded.source).toBe('unknown')
  })

  it('rate-limits a burst from one client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const ip = { 'x-forwarded-for': '203.0.113.9' }

    const statuses: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const res = await handler(post({ email: 'a@b.co', source: 'reading' }, ip))
      statuses.push(res.status)
    }
    // First 5 pass, the rest are throttled within the window.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
  })
})
