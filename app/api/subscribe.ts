/**
 * [INPUT]: POST body { email, source } from src/lib/subscribe.ts
 * [OUTPUT]: Forwards { email, source, created_at } to the Make webhook, returns 200/4xx/5xx
 * [POS]: Vercel Edge Function — the only place MAKE_WEBHOOK_URL is read, keeping it off the client
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * Shared backend for email capture and the Soul Card unlock flow. This function
 * never touches DeepSeek or PayPal — it only relays a captured email to Make.
 */

export const config = { runtime: 'edge' }

const MAX_BODY_LENGTH = 2_000
const MAX_EMAIL_LENGTH = 254
const MAX_SOURCE_LENGTH = 64
// Basic per-IP rate limit (best-effort, per warm isolate).
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000

// RFC-5322-lite: good enough to reject obviously invalid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const hits = new Map<string, number[]>()

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT_MAX
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405)
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (isRateLimited(ip)) {
    return jsonResponse({ error: 'Too many requests. Please try again shortly.' }, 429)
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_LENGTH) {
    return jsonResponse({ error: 'Request body too large.' }, 413)
  }

  let parsed: { email?: unknown; source?: unknown }
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const email = typeof parsed.email === 'string' ? parsed.email.trim() : ''
  // Ignore requests with no email outright.
  if (!email) {
    return jsonResponse({ error: 'Email is required.' }, 400)
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Please enter a valid email address.' }, 400)
  }

  const source =
    typeof parsed.source === 'string'
      ? parsed.source.trim().slice(0, MAX_SOURCE_LENGTH)
      : 'unknown'

  const webhookUrl = process.env.MAKE_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonResponse({ error: 'Subscription is not configured on the server.' }, 500)
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source,
        created_at: new Date().toISOString(),
      }),
    })
    if (!upstream.ok) {
      return jsonResponse({ error: 'Subscription service is temporarily unavailable.' }, 502)
    }
  } catch {
    return jsonResponse({ error: 'Subscription service is temporarily unavailable.' }, 502)
  }

  return jsonResponse({ ok: true }, 200)
}
