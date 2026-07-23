/**
 * [INPUT]: Exact same-origin POST { email, source } from src/lib/subscribe.ts
 * [OUTPUT]: Forwards a normalized subscription to the configured Make webhook
 * [POS]: Public email-capture boundary; MAKE_WEBHOOK_URL never reaches the browser
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import { readAppOrigin } from './_csrf'

export const config = { runtime: 'edge' }

const MAX_BODY_BYTES = 2_048
const MAX_EMAIL_LENGTH = 254
const BODY_READ_DEADLINE_MS = 3_000
const WEBHOOK_DEADLINE_MS = 10_000
const RATE_LIMIT_MAX = 5
const FALLBACK_RATE_LIMIT_MAX = 2
const GLOBAL_RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_RATE_BUCKETS = 2_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IPV4_PART_RE = /^(0|[1-9][0-9]{0,2})$/
const MAKE_WEBHOOK_HOST_RE = /^hook(?:\.[a-z0-9-]+)?\.make\.com$/u
const ALLOWED_SOURCES = new Set(['reading', 'soul_card', 'exit_intent'])

interface SubscribeErrorBody {
  error: {
    code: string
    message: string
  }
}

interface ClientIdentity {
  key: string
  fallback: boolean
}

interface RateBucket {
  count: number
  resetAt: number
}

export interface SubscribeRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export interface SubscribeRateLimiter {
  consume(
    identity: ClientIdentity,
    nowMs: number,
  ): SubscribeRateLimitResult
}

export interface SubscribeDependencies {
  fetchImpl?: typeof fetch
  limiter?: SubscribeRateLimiter
  now?: () => Date
  bodyReadDeadlineMs?: number
  webhookDeadlineMs?: number
}

class SubscribeApiError extends Error {
  readonly status: number
  readonly code: string
  readonly headers: Readonly<Record<string, string>>

  constructor(
    status: number,
    code: string,
    message: string,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(message)
    this.name = 'SubscribeApiError'
    this.status = status
    this.code = code
    this.headers = headers
  }
}

class WebhookDeadlineError extends Error {
  constructor() {
    super('Webhook deadline exceeded.')
    this.name = 'WebhookDeadlineError'
  }
}

class WebhookRequestAbortedError extends Error {
  constructor() {
    super('Webhook request aborted.')
    this.name = 'WebhookRequestAbortedError'
  }
}

class BodyReadDeadlineError extends Error {
  constructor() {
    super('Request body deadline exceeded.')
    this.name = 'BodyReadDeadlineError'
  }
}

class BodyReadAbortedError extends Error {
  constructor() {
    super('Request body read aborted.')
    this.name = 'BodyReadAbortedError'
  }
}

function jsonResponse(
  body: Record<string, unknown> | SubscribeErrorBody,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
}

function errorResponse(error: unknown): Response {
  const safeError = error instanceof SubscribeApiError
    ? error
    : new SubscribeApiError(
        503,
        'subscription_unavailable',
        'Subscription is temporarily unavailable.',
      )
  return jsonResponse({
    error: {
      code: safeError.code,
      message: safeError.message,
    },
  }, safeError.status, safeError.headers)
}

export function createBestEffortSubscribeRateLimiter(
  options: {
    perIpMax?: number
    fallbackMax?: number
    globalMax?: number
    windowMs?: number
    maxBuckets?: number
  } = {},
): SubscribeRateLimiter {
  const perIpMax = options.perIpMax ?? RATE_LIMIT_MAX
  const fallbackMax = options.fallbackMax ?? FALLBACK_RATE_LIMIT_MAX
  const globalMax = options.globalMax ?? GLOBAL_RATE_LIMIT_MAX
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS
  const maxBuckets = options.maxBuckets ?? MAX_RATE_BUCKETS
  const buckets = new Map<string, RateBucket>()
  let globalBucket: RateBucket | null = null

  return {
    consume(identity, nowMs) {
      if (buckets.size >= maxBuckets) {
        for (const [key, bucket] of buckets) {
          if (bucket.resetAt <= nowMs) buckets.delete(key)
        }
      }
      const requestedKey = identity.key
      const dedicatedBucketCount = buckets.size
        - (buckets.has('overflow-global') ? 1 : 0)
      const key = (
        dedicatedBucketCount >= Math.max(0, maxBuckets - 1)
        && !buckets.has(requestedKey)
      )
        ? 'overflow-global'
        : requestedKey
      const limit = identity.fallback || key === 'overflow-global'
        ? fallbackMax
        : perIpMax
      const current = buckets.get(key)
      if (!current || current.resetAt <= nowMs) {
        buckets.set(key, { count: 1, resetAt: nowMs + windowMs })
      } else {
        current.count += 1
        if (current.count > limit) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((current.resetAt - nowMs) / 1_000),
            ),
          }
        }
      }

      if (!globalBucket || globalBucket.resetAt <= nowMs) {
        globalBucket = { count: 1, resetAt: nowMs + windowMs }
      } else {
        globalBucket.count += 1
      }
      return {
        allowed: globalBucket.count <= globalMax,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((globalBucket.resetAt - nowMs) / 1_000),
        ),
      }
    },
  }
}

// Bounded warm-isolate abuse brake only. Traffic across isolates can bypass it;
// this is intentionally neither a distributed quota nor an authorization check.
const defaultLimiter = createBestEffortSubscribeRateLimiter()

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || hasControlCharacter(value)) {
    throw new SubscribeApiError(
      400,
      'invalid_email',
      'Please enter a valid email address.',
    )
  }
  const email = value.trim().toLowerCase()
  if (
    !email
    || email.length > MAX_EMAIL_LENGTH
    || !EMAIL_RE.test(email)
  ) {
    throw new SubscribeApiError(
      400,
      'invalid_email',
      'Please enter a valid email address.',
    )
  }
  return email
}

function normalizeSource(value: unknown): string {
  if (typeof value !== 'string' || !ALLOWED_SOURCES.has(value)) {
    throw new SubscribeApiError(
      400,
      'invalid_source',
      'Subscription source is invalid.',
    )
  }
  return value
}

function parseBody(value: unknown): { email: string; source: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SubscribeApiError(
      400,
      'invalid_request',
      'Subscription request is invalid.',
    )
  }
  const body = value as Record<string, unknown>
  const keys = Object.keys(body)
  if (
    keys.length !== 2
    || keys.some((key) => key !== 'email' && key !== 'source')
    || !Object.prototype.hasOwnProperty.call(body, 'email')
    || !Object.prototype.hasOwnProperty.call(body, 'source')
  ) {
    throw new SubscribeApiError(
      400,
      'invalid_request',
      'Subscription request is invalid.',
    )
  }
  return {
    email: normalizeEmail(body.email),
    source: normalizeSource(body.source),
  }
}

async function readStrictJson(
  req: Request,
  deadlineMs: number,
): Promise<unknown> {
  if (req.headers.get('Content-Type') !== 'application/json') {
    throw new SubscribeApiError(
      415,
      'unsupported_media_type',
      'Content-Type must be application/json.',
    )
  }
  const contentLength = req.headers.get('Content-Length')
  if (contentLength) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      throw new SubscribeApiError(
        400,
        'invalid_request',
        'Subscription request is invalid.',
      )
    }
    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new SubscribeApiError(
        413,
        'request_too_large',
        'Subscription request is too large.',
      )
    }
  }
  if (!req.body) {
    throw new SubscribeApiError(
      400,
      'invalid_request',
      'Subscription request is invalid.',
    )
  }

  const reader = req.body.getReader()
  let rejectBoundary: ((error: Error) => void) | null = null
  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject
  })
  const stop = (error: Error) => {
    rejectBoundary?.(error)
    rejectBoundary = null
    void reader.cancel(error).catch(() => undefined)
  }
  const abortFromRequest = () => stop(new BodyReadAbortedError())
  req.signal.addEventListener('abort', abortFromRequest, { once: true })
  if (req.signal.aborted) abortFromRequest()
  const timeout = setTimeout(
    () => stop(new BodyReadDeadlineError()),
    deadlineMs,
  )

  const operation = (async () => {
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined)
        throw new SubscribeApiError(
          413,
          'request_too_large',
          'Subscription request is too large.',
        )
      }
      chunks.push(chunk.value)
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    let raw: string
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new SubscribeApiError(
        400,
        'invalid_request',
        'Subscription request is invalid.',
      )
    }
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new SubscribeApiError(
        400,
        'invalid_request',
        'Subscription request is invalid.',
      )
    }
  })()

  try {
    return await Promise.race([operation, boundary])
  } catch (error) {
    if (error instanceof SubscribeApiError) throw error
    if (error instanceof BodyReadAbortedError || req.signal.aborted) {
      throw new SubscribeApiError(
        499,
        'request_aborted',
        'Subscription request was cancelled.',
      )
    }
    if (error instanceof BodyReadDeadlineError) {
      throw new SubscribeApiError(
        408,
        'request_timeout',
        'Subscription request timed out.',
      )
    }
    throw new SubscribeApiError(
      400,
      'invalid_request',
      'Subscription request is invalid.',
    )
  } finally {
    clearTimeout(timeout)
    req.signal.removeEventListener('abort', abortFromRequest)
    rejectBoundary = null
  }
}

function normalizeIpv4(value: string): string | null {
  const parts = value.split('.')
  if (
    parts.length !== 4
    || parts.some((part) => !IPV4_PART_RE.test(part) || Number(part) > 255)
  ) {
    return null
  }
  return parts.map(Number).join('.')
}

function normalizeIpv6(value: string): string | null {
  if (!value.includes(':') || !/^[0-9A-Fa-f:]+$/.test(value)) return null
  try {
    const hostname = new URL(`http://[${value}]/`).hostname
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) return null
    return hostname.slice(1, -1).toLowerCase()
  } catch {
    return null
  }
}

function clientIdentity(req: Request): ClientIdentity {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded === null) {
    return { key: 'missing-xff-global', fallback: true }
  }
  if (
    !forwarded
    || forwarded.length > 64
    || forwarded.includes(',')
    || /[\s%]/u.test(forwarded)
    || hasControlCharacter(forwarded)
  ) {
    throw new SubscribeApiError(
      400,
      'invalid_client_ip',
      'Client network metadata is invalid.',
    )
  }
  const normalized = forwarded.includes('.')
    ? normalizeIpv4(forwarded)
    : normalizeIpv6(forwarded)
  if (!normalized) {
    throw new SubscribeApiError(
      400,
      'invalid_client_ip',
      'Client network metadata is invalid.',
    )
  }
  return { key: `ip:${normalized}`, fallback: false }
}

function requireSameOrigin(req: Request): string {
  let appOrigin: string
  try {
    appOrigin = readAppOrigin()
  } catch {
    throw new SubscribeApiError(
      503,
      'subscription_unavailable',
      'Subscription is temporarily unavailable.',
    )
  }
  if (
    req.headers.get('Origin') !== appOrigin
    || req.headers.get('Sec-Fetch-Site') !== 'same-origin'
  ) {
    throw new SubscribeApiError(
      403,
      'forbidden_origin',
      'Subscription request origin is not allowed.',
    )
  }
  return appOrigin
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
  )
}

function readWebhookUrl(appOrigin: string): string {
  const configured = process.env.MAKE_WEBHOOK_URL
  if (
    !configured
    || configured !== configured.trim()
    || hasControlCharacter(configured)
  ) {
    throw new SubscribeApiError(
      503,
      'subscription_unavailable',
      'Subscription is temporarily unavailable.',
    )
  }
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new SubscribeApiError(
      503,
      'subscription_unavailable',
      'Subscription is temporarily unavailable.',
    )
  }
  const isLocalDevelopment = (
    (
      process.env.NODE_ENV === 'development'
      || process.env.NODE_ENV === 'test'
    )
    && new URL(appOrigin).hostname === 'localhost'
  )
  const isLocalWebhook = (
    url.protocol === 'http:'
    && isLoopbackHostname(url.hostname)
    && isLocalDevelopment
  )
  const isOfficialMakeWebhook = (
    url.protocol === 'https:'
    && (url.port === '' || url.port === '443')
    && MAKE_WEBHOOK_HOST_RE.test(url.hostname)
  )
  if (
    url.username
    || url.password
    || url.hash
    || !(isOfficialMakeWebhook || isLocalWebhook)
  ) {
    throw new SubscribeApiError(
      503,
      'subscription_unavailable',
      'Subscription is temporarily unavailable.',
    )
  }
  return url.toString()
}

async function callWebhook(
  req: Request,
  webhookUrl: string,
  body: { email: string; source: string; created_at: string },
  fetchImpl: typeof fetch,
  deadlineMs: number,
): Promise<void> {
  if (req.signal.aborted) {
    throw new SubscribeApiError(
      499,
      'request_aborted',
      'Subscription request was cancelled.',
    )
  }
  const controller = new AbortController()
  let upstreamBody: ReadableStream<Uint8Array> | null = null
  let rejectBoundary: ((error: Error) => void) | null = null
  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject
  })
  const stop = (error: Error) => {
    rejectBoundary?.(error)
    rejectBoundary = null
    controller.abort(error)
    void upstreamBody?.cancel(error).catch(() => undefined)
  }
  const abortFromRequest = () => stop(new WebhookRequestAbortedError())
  req.signal.addEventListener('abort', abortFromRequest, { once: true })
  if (req.signal.aborted) abortFromRequest()
  const timeout = setTimeout(() => stop(new WebhookDeadlineError()), deadlineMs)

  const operation = (async () => {
    const upstream = await fetchImpl(webhookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    upstreamBody = upstream.body
    if (!upstream.ok) {
      await upstream.body?.cancel()
      upstreamBody = null
      throw new SubscribeApiError(
        502,
        'webhook_unavailable',
        'Subscription service is temporarily unavailable.',
      )
    }
    await upstream.body?.cancel()
    upstreamBody = null
  })()

  try {
    await Promise.race([operation, boundary])
  } catch (error) {
    if (error instanceof SubscribeApiError) throw error
    if (error instanceof WebhookRequestAbortedError || req.signal.aborted) {
      throw new SubscribeApiError(
        499,
        'request_aborted',
        'Subscription request was cancelled.',
      )
    }
    if (error instanceof WebhookDeadlineError) {
      throw new SubscribeApiError(
        504,
        'webhook_timeout',
        'Subscription service timed out.',
      )
    }
    throw new SubscribeApiError(
      502,
      'webhook_unavailable',
      'Subscription service is temporarily unavailable.',
    )
  } finally {
    clearTimeout(timeout)
    req.signal.removeEventListener('abort', abortFromRequest)
    rejectBoundary = null
  }
}

export async function handleSubscribe(
  req: Request,
  dependencies: SubscribeDependencies = {},
): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      throw new SubscribeApiError(
        405,
        'method_not_allowed',
        'Method Not Allowed',
        { Allow: 'POST' },
      )
    }
    const appOrigin = requireSameOrigin(req)
    const webhookUrl = readWebhookUrl(appOrigin)
    const identity = clientIdentity(req)
    const now = dependencies.now?.() ?? new Date()
    const body = parseBody(await readStrictJson(
      req,
      dependencies.bodyReadDeadlineMs ?? BODY_READ_DEADLINE_MS,
    ))
    const rateLimit = (dependencies.limiter ?? defaultLimiter)
      .consume(identity, now.getTime())
    if (!rateLimit.allowed) {
      throw new SubscribeApiError(
        429,
        'rate_limited',
        'Too many requests. Please try again shortly.',
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      )
    }
    await callWebhook(
      req,
      webhookUrl,
      {
        ...body,
        created_at: now.toISOString(),
      },
      dependencies.fetchImpl ?? fetch,
      dependencies.webhookDeadlineMs ?? WEBHOOK_DEADLINE_MS,
    )
    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return errorResponse(error)
  }
}

export default async function handler(req: Request): Promise<Response> {
  return handleSubscribe(req)
}
