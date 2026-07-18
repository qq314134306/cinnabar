/**
 * [INPUT]: Depends on a POST body { email: string, source?: string } from the
 *   EmailCapture component (src/components/email/EmailCapture.tsx)
 * [OUTPUT]: Forwards { email, source, created_at } to the Make webhook and returns 200
 * [POS]: Vercel Edge Function — the only place MAKE_WEBHOOK_URL is read, keeping the
 *   webhook secret off the client. Completely separate from the DeepSeek/PayPal flow.
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

export const config = { runtime: 'edge' }

/** Reject oversized payloads outright — a valid subscribe body is tiny. */
const MAX_BODY_LENGTH = 2_000

/** Simple, tolerant email shape check (server-side validation is the source of truth). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Allow-list of known sources; unknown labels are coerced to "unknown". */
const KNOWN_SOURCES = new Set(['reading', 'exit_intent', 'soul_card'])

/* ------------------------------------------------------------
   Best-effort in-memory rate limit.
   Edge isolates are short-lived and not shared, so this only slows down
   bursts from a single warm instance — enough to blunt trivial abuse
   without a datastore. Real dedup/limits live in the Make scenario.
   ------------------------------------------------------------ */

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5
const hits = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  // Opportunistically prune to keep the map from growing unbounded.
  if (hits.size > 5_000) hits.clear()
  return recent.length > RATE_LIMIT_MAX
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405)
  }

  const clientKey =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (isRateLimited(clientKey)) {
    return jsonResponse({ error: 'Too many requests. Please try again shortly.' }, 429)
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_LENGTH) {
    return jsonResponse({ error: 'Request body too large.' }, 413)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { email, source } = (parsed ?? {}) as { email?: unknown; source?: unknown }

  // Ignore requests without a usable email (missing/blank/oversized).
  if (typeof email !== 'string' || email.length === 0 || email.length > 254) {
    return jsonResponse({ error: 'A valid email is required.' }, 400)
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail)) {
    return jsonResponse({ error: 'Please enter a valid email address.' }, 400)
  }

  const normalizedSource =
    typeof source === 'string' && KNOWN_SOURCES.has(source) ? source : 'unknown'

  const webhookUrl = process.env.MAKE_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonResponse({ error: 'Subscriptions are not configured.' }, 500)
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        source: normalizedSource,
        created_at: new Date().toISOString(),
      }),
    })

    if (!upstream.ok) {
      return jsonResponse({ error: 'Could not save your email right now.' }, 502)
    }
  } catch {
    return jsonResponse({ error: 'Could not reach the subscription service.' }, 502)
  }

  return jsonResponse({ ok: true }, 200)
}
