/**
 * Receives browser CSP violation reports. Logs only directive and host-level
 * details; full URLs, query strings, samples, cookies, and user data are never
 * retained.
 */

export const config = { runtime: 'edge' }

const MAX_BODY_LENGTH = 16_000
const WINDOW_MS = 60_000
const MAX_REPORTS_PER_WINDOW = 20
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

class BodyTooLargeError extends Error {}

function clientKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isRateLimited(req: Request): boolean {
  const key = clientKey(req)
  const now = Date.now()
  if (rateBuckets.size > 1_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > MAX_REPORTS_PER_WINDOW
}

async function readBodyWithLimit(req: Request): Promise<string> {
  const contentLength = req.headers.get('content-length')
  if (contentLength) {
    const declaredLength = Number(contentLength)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_LENGTH) {
      throw new BodyTooLargeError()
    }
  }
  if (!req.body) return ''

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalLength += value.byteLength
    if (totalLength > MAX_BODY_LENGTH) {
      await reader.cancel()
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

function safeHost(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  try {
    return new URL(value, 'https://invalid.local').hostname.slice(0, 253)
  } catch {
    return undefined
  }
}

function safeToken(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value)
    ? value
    : undefined
}

function sanitizeReport(body: unknown): Record<string, string | undefined> | null {
  const envelope = Array.isArray(body) ? body[0] : body
  if (!envelope || typeof envelope !== 'object') return null
  const record = envelope as Record<string, unknown>
  const report =
    record['csp-report'] && typeof record['csp-report'] === 'object'
      ? record['csp-report'] as Record<string, unknown>
      : record.body && typeof record.body === 'object'
        ? record.body as Record<string, unknown>
        : record

  return {
    directive: safeToken(report['effective-directive'] ?? report.effectiveDirective),
    blockedHost: safeHost(report['blocked-uri'] ?? report.blockedURL),
    documentHost: safeHost(report['document-uri'] ?? report.documentURL),
    disposition: safeToken(report.disposition),
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    })
  }
  if (isRateLimited(req)) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    })
  }

  let rawBody: string
  try {
    rawBody = await readBodyWithLimit(req)
  } catch (error) {
    return new Response(null, {
      status: error instanceof BodyTooLargeError ? 413 : 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  if (!rawBody) {
    return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const report = sanitizeReport(JSON.parse(rawBody))
    if (report) console.warn('csp_violation', report)
  } catch {
    return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
