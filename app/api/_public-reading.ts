/**
 * [INPUT]: Exact reading.v1 discriminated requests plus fail-closed server configuration
 * [OUTPUT]: Server-owned prompts/facts and an atomically claimed daily public quota
 * [POS]: SERVER-ONLY authority for unauthenticated AI readings
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  buildCompatibilityPrompt,
  buildFreeReadingPrompt,
  buildSystemPrompt,
  type Persona,
} from '../src/lib/ai-prompts'
import {
  READING_CONTRACT_VERSION,
  type ReadingPersona,
  type ReadingRequest,
} from '../src/lib/reading-contract'
import {
  buildYearlyChartFacts,
  buildZiWeiChartFacts,
} from '../src/lib/chart-facts'
import {
  parseFutureReportRequestInput,
  rebuildChartIdentity,
  type FutureReportBirthRequest,
} from './_future-report-chart'
import { HttpError } from './_require-user'
import { readAppOrigin } from './_csrf'
import { getSupabaseAdmin } from './_supabase-admin'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MAX_BODY_BYTES = 4_096
const UPSTREAM_TIMEOUT_MS = 20_000
const QUOTA_TIMEOUT_MS = 7_000
const MAX_LIMIT = 1_000_000
const BASE64URL_32_BYTES_RE = /^[A-Za-z0-9_-]{43}$/
const POSITIVE_INTEGER_RE = /^[1-9][0-9]{0,6}$/
const IPV4_PART_RE = /^(0|[1-9][0-9]{0,2})$/
const FULL_BIRTH_KEYS = new Set([
  'year',
  'month',
  'day',
  'hour',
  'gender',
  'birthplace',
  'trueSolarEnabled',
  'birthTimeReliable',
])
const BASIC_BIRTH_KEYS = new Set(['year', 'month', 'day', 'hour', 'gender'])

export const PUBLIC_READING_POLICIES = {
  natal: {
    model: 'deepseek-chat',
    stream: true,
    max_tokens: 700,
    temperature: 0.7,
  },
  compatibility: {
    model: 'deepseek-chat',
    stream: true,
    max_tokens: 1_100,
    temperature: 0.65,
  },
  yearly: {
    model: 'deepseek-chat',
    stream: true,
    max_tokens: 900,
    temperature: 0.65,
  },
} as const

type PublicReadingOperation = ReadingRequest['operation']

interface PublicReadingConfig {
  appOrigin: string
  apiKey: string
  quotaHmacKey: ArrayBuffer
  ipLimit: number
  globalLimit: number
}

interface ParsedNatalReading {
  operation: 'natal'
  persona: ReadingPersona
  birth: FutureReportBirthRequest
}

interface ParsedCompatibilityReading {
  operation: 'compatibility'
  persona: ReadingPersona
  personA: FutureReportBirthRequest
  personB: FutureReportBirthRequest
}

interface ParsedYearlyReading {
  operation: 'yearly'
  persona: ReadingPersona
  birth: FutureReportBirthRequest
  year: number
}

type ParsedReading =
  | ParsedNatalReading
  | ParsedCompatibilityReading
  | ParsedYearlyReading

interface BuiltReading {
  operation: PublicReadingOperation
  messages: [
    { role: 'system'; content: string },
    { role: 'user'; content: string },
  ]
}

interface QuotaClaim {
  allowed: boolean
  retryAfterSeconds: number
}

export interface PublicReadingDependencies {
  fetchImpl?: typeof fetch
  now?: () => Date
  claimQuota?: (
    globalSubjectHash: string,
    ipSubjectHash: string,
    globalLimit: number,
    ipLimit: number,
    requestSignal: AbortSignal,
  ) => Promise<QuotaClaim>
  upstreamTimeoutMs?: number
}

class PublicReadingError extends Error {
  readonly status: number
  readonly code: string
  readonly headers: Readonly<Record<string, string>>

  constructor(
    status: number,
    code: string,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(code)
    this.name = 'PublicReadingError'
    this.status = status
    this.code = code
    this.headers = headers
  }
}

function errorResponse(error: unknown): Response {
  const safeError = error instanceof PublicReadingError
    ? error
    : error instanceof HttpError
      ? new PublicReadingError(
          error.status === 403 ? 403 : 400,
          error.status === 403 ? 'minor_not_eligible' : 'invalid_request',
        )
      : new PublicReadingError(503, 'reading_unavailable')

  const message = safeError.status === 429
    ? 'The daily reading limit has been reached. Please try again later.'
    : safeError.status === 403
      ? 'This reading request is not permitted.'
      : safeError.status >= 500
        ? 'The reading service is temporarily unavailable.'
        : 'The reading request could not be completed.'

  return new Response(JSON.stringify({
    error: { code: safeError.code, message },
  }), {
    status: safeError.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...safeError.headers,
    },
  })
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  required: readonly string[] = [...keys],
): void {
  const actual = Object.keys(value)
  if (
    actual.some((key) => !keys.has(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new PublicReadingError(400, 'invalid_request')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requirePersona(value: unknown): ReadingPersona {
  if (value !== 'scholar' && value !== 'sage') {
    throw new PublicReadingError(400, 'invalid_request')
  }
  return value
}

function requireBirthObject(
  value: unknown,
  keys: ReadonlySet<string>,
  required?: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new PublicReadingError(400, 'invalid_request')
  }
  requireExactKeys(value, keys, required)
  return value
}

function parseFullBirth(
  value: unknown,
  persona: ReadingPersona,
  now: Date,
): FutureReportBirthRequest {
  const birth = requireBirthObject(value, FULL_BIRTH_KEYS, [
    'year',
    'month',
    'day',
    'hour',
    'gender',
    'trueSolarEnabled',
    'birthTimeReliable',
  ])
  return parseFutureReportRequestInput({ birth, persona }, now).birth
}

function parseBasicBirth(
  value: unknown,
  persona: ReadingPersona,
  now: Date,
): FutureReportBirthRequest {
  const birth = requireBirthObject(value, BASIC_BIRTH_KEYS)
  return parseFutureReportRequestInput({
    birth: {
      ...birth,
      trueSolarEnabled: false,
      birthTimeReliable: true,
    },
    persona,
  }, now).birth
}

function isBasicBirthShape(value: unknown): boolean {
  return (
    isRecord(value)
    && Object.keys(value).length === BASIC_BIRTH_KEYS.size
    && Object.keys(value).every((key) => BASIC_BIRTH_KEYS.has(key))
  )
}

function requireAdult(birth: FutureReportBirthRequest, now: Date): void {
  const adultAt = Date.UTC(
    birth.year + 18,
    birth.month - 1,
    birth.day,
  )
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  if (today < adultAt) {
    throw new PublicReadingError(403, 'minor_not_eligible')
  }
}

function parseReading(value: unknown, now: Date): ParsedReading {
  if (!isRecord(value) || value.version !== READING_CONTRACT_VERSION) {
    throw new PublicReadingError(400, 'invalid_request')
  }

  if (value.operation === 'natal') {
    requireExactKeys(
      value,
      new Set(['version', 'operation', 'persona', 'birth']),
    )
    const persona = requirePersona(value.persona)
    const birth = parseFullBirth(value.birth, persona, now)
    requireAdult(birth, now)
    return { operation: 'natal', persona, birth }
  }

  if (value.operation === 'compatibility') {
    requireExactKeys(
      value,
      new Set(['version', 'operation', 'persona', 'personA', 'personB']),
    )
    const persona = requirePersona(value.persona)
    const personAIsBasic = isBasicBirthShape(value.personA)
    const personBIsBasic = isBasicBirthShape(value.personB)
    if (personAIsBasic !== personBIsBasic) {
      throw new PublicReadingError(400, 'invalid_request')
    }
    // Rolling-deployment compatibility applies only to an entire old-client
    // request. Mixed people would silently apply solar correction to one side.
    const parsePerson = personAIsBasic ? parseBasicBirth : parseFullBirth
    const personA = parsePerson(value.personA, persona, now)
    const personB = parsePerson(value.personB, persona, now)
    requireAdult(personA, now)
    requireAdult(personB, now)
    return { operation: 'compatibility', persona, personA, personB }
  }

  if (value.operation === 'yearly') {
    requireExactKeys(
      value,
      new Set(['version', 'operation', 'persona', 'birth', 'year']),
    )
    const persona = requirePersona(value.persona)
    const birth = parseFullBirth(value.birth, persona, now)
    requireAdult(birth, now)
    const currentYear = now.getUTCFullYear()
    if (
      !Number.isInteger(value.year)
      || (value.year as number) < currentYear - 5
      || (value.year as number) > currentYear + 4
    ) {
      throw new PublicReadingError(400, 'invalid_request')
    }
    return {
      operation: 'yearly',
      persona,
      birth,
      year: value.year as number,
    }
  }

  throw new PublicReadingError(400, 'invalid_request')
}

function asIdentityInput(
  birth: FutureReportBirthRequest,
  persona: ReadingPersona,
): { birth: FutureReportBirthRequest; persona: Persona } {
  return { birth, persona }
}

function buildYearlyPrompt(
  chartFacts: string,
  yearlyFacts: string,
  year: number,
): string {
  return `Write a ${year} yearly reading of about 300-420 words. Ground every statement in the server-generated natal and annual facts below.

Cover career and direction, wealth and opportunity, relationships, likely pressure points, and practical choices. Name the chart feature behind each tendency. Never present fate as fixed and never give medical, legal, financial, pregnancy, disaster, disease, or death predictions.

NATAL CHART FACTS:
${chartFacts}

SERVER-GENERATED ${year} YEARLY FACTS:
${yearlyFacts}`
}

async function buildReading(
  reading: ParsedReading,
  now: Date,
): Promise<BuiltReading> {
  if (reading.operation === 'natal') {
    const identity = await rebuildChartIdentity(
      asIdentityInput(reading.birth, reading.persona),
      now,
    )
    return {
      operation: reading.operation,
      messages: [
        { role: 'system', content: buildSystemPrompt(reading.persona) },
        { role: 'user', content: buildFreeReadingPrompt(identity.chartFacts) },
      ],
    }
  }

  if (reading.operation === 'compatibility') {
    const [identityA, identityB] = await Promise.all([
      rebuildChartIdentity(asIdentityInput(reading.personA, reading.persona), now),
      rebuildChartIdentity(asIdentityInput(reading.personB, reading.persona), now),
    ])
    const personAFacts = buildZiWeiChartFacts(
      identityA.chart,
      identityA.birthInfo,
      { label: 'PERSON A' },
    )
    const personBFacts = buildZiWeiChartFacts(
      identityB.chart,
      identityB.birthInfo,
      { label: 'PERSON B' },
    )
    return {
      operation: reading.operation,
      messages: [
        { role: 'system', content: buildSystemPrompt(reading.persona) },
        {
          role: 'user',
          content: buildCompatibilityPrompt(personAFacts, personBFacts),
        },
      ],
    }
  }

  const identity = await rebuildChartIdentity(
    asIdentityInput(reading.birth, reading.persona),
    now,
  )
  const yearlyFacts = buildYearlyChartFacts(
    identity.chart,
    identity.birthInfo,
    [reading.year],
  )
  return {
    operation: reading.operation,
    messages: [
      { role: 'system', content: buildSystemPrompt(reading.persona) },
      {
        role: 'user',
        content: buildYearlyPrompt(identity.chartFacts, yearlyFacts, reading.year),
      },
    ],
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function decodeHmacKey(value: string | undefined): ArrayBuffer {
  if (!value || !BASE64URL_32_BYTES_RE.test(value)) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  try {
    const decoded = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`)
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
    if (bytes.byteLength !== 32) {
      throw new Error('invalid length')
    }
    return ownedArrayBuffer(bytes)
  } catch {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
}

function readLimit(value: string | undefined): number {
  if (!value || !POSITIVE_INTEGER_RE.test(value)) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > MAX_LIMIT) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  return parsed
}

function readConfig(): PublicReadingConfig {
  if (process.env.ENABLE_PUBLIC_AI_READINGS !== 'true') {
    throw new PublicReadingError(503, 'readings_disabled')
  }
  let appOrigin: string
  try {
    appOrigin = readAppOrigin()
  } catch {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey.length > 512) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret || supabaseSecret.length > 2_048) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  try {
    const url = new URL(supabaseUrl)
    if (
      url.origin !== supabaseUrl
      || !(
        url.protocol === 'https:'
        || (url.protocol === 'http:' && url.hostname === 'localhost')
      )
    ) {
      throw new Error('invalid Supabase URL')
    }
  } catch {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  const ipLimit = readLimit(process.env.PUBLIC_AI_DAILY_IP_LIMIT)
  const globalLimit = readLimit(process.env.PUBLIC_AI_DAILY_GLOBAL_LIMIT)
  if (globalLimit < ipLimit) {
    throw new PublicReadingError(503, 'reading_unavailable')
  }
  return {
    appOrigin,
    apiKey,
    quotaHmacKey: decodeHmacKey(process.env.PUBLIC_AI_QUOTA_HMAC_KEY),
    ipLimit,
    globalLimit,
  }
}

function requireSameOrigin(req: Request, appOrigin: string): void {
  if (
    req.headers.get('Origin') !== appOrigin
    || req.headers.get('Sec-Fetch-Site') !== 'same-origin'
  ) {
    throw new PublicReadingError(403, 'forbidden_origin')
  }
}

async function readStrictBody(req: Request): Promise<unknown> {
  if (req.headers.get('Content-Type') !== 'application/json') {
    throw new PublicReadingError(415, 'unsupported_media_type')
  }
  const declaredLength = req.headers.get('Content-Length')
  if (
    declaredLength
    && (/^(0|[1-9][0-9]*)$/.test(declaredLength) === false
      || Number(declaredLength) > MAX_BODY_BYTES)
  ) {
    throw new PublicReadingError(413, 'request_too_large')
  }
  if (!req.body) {
    throw new PublicReadingError(400, 'invalid_request')
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new PublicReadingError(413, 'request_too_large')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let raw: string
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PublicReadingError(400, 'invalid_request')
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new PublicReadingError(400, 'invalid_request')
  }
}

function normalizeClientIp(value: string | null): string {
  if (!value) {
    throw new PublicReadingError(400, 'client_ip_unavailable')
  }
  const input = value.trim()
  if (
    !input
    || input.length > 64
    || input !== value
    || /[\s,%]/u.test(input)
    || [...input].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new PublicReadingError(400, 'client_ip_unavailable')
  }

  if (input.includes('.')) {
    const parts = input.split('.')
    if (
      parts.length !== 4
      || parts.some((part) => !IPV4_PART_RE.test(part) || Number(part) > 255)
    ) {
      throw new PublicReadingError(400, 'client_ip_unavailable')
    }
    return parts.map(Number).join('.')
  }

  if (!input.includes(':') || !/^[0-9A-Fa-f:]+$/.test(input)) {
    throw new PublicReadingError(400, 'client_ip_unavailable')
  }
  try {
    const hostname = new URL(`http://[${input}]/`).hostname
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) {
      throw new Error('invalid IP')
    }
    return hostname.slice(1, -1).toLowerCase()
  } catch {
    throw new PublicReadingError(400, 'client_ip_unavailable')
  }
}

async function hmacSubject(key: ArrayBuffer, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    ownedArrayBuffer(new TextEncoder().encode(value)),
  )
  let binary = ''
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

async function claimQuota(
  globalSubjectHash: string,
  ipSubjectHash: string,
  globalLimit: number,
  ipLimit: number,
  requestSignal: AbortSignal,
): Promise<QuotaClaim> {
  const controller = new AbortController()
  const abortFromRequest = () => controller.abort(requestSignal.reason)
  if (requestSignal.aborted) {
    abortFromRequest()
  } else {
    requestSignal.addEventListener('abort', abortFromRequest, { once: true })
    if (requestSignal.aborted) abortFromRequest()
  }
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Public reading quota timed out.', 'TimeoutError'))
  }, QUOTA_TIMEOUT_MS)

  try {
    const result = await getSupabaseAdmin()
      .rpc('claim_public_ai_daily_quota', {
        p_global_subject_hash: globalSubjectHash,
        p_ip_subject_hash: ipSubjectHash,
        p_global_limit: globalLimit,
        p_ip_limit: ipLimit,
      })
      .abortSignal(controller.signal)
      .single()
    if (result.error || !isRecord(result.data)) {
      throw new PublicReadingError(503, 'quota_unavailable')
    }
    const allowed = result.data.allowed
    const retryAfterSeconds = result.data.retry_after_seconds
    if (
      typeof allowed !== 'boolean'
      || !Number.isInteger(retryAfterSeconds)
      || (retryAfterSeconds as number) < 1
      || (retryAfterSeconds as number) > 86_400
    ) {
      throw new PublicReadingError(503, 'quota_unavailable')
    }
    return { allowed, retryAfterSeconds: retryAfterSeconds as number }
  } catch (error) {
    if (error instanceof PublicReadingError) throw error
    if (requestSignal.aborted) {
      throw new PublicReadingError(499, 'request_aborted')
    }
    throw new PublicReadingError(503, 'quota_unavailable')
  } finally {
    clearTimeout(timeout)
    requestSignal.removeEventListener('abort', abortFromRequest)
  }
}

async function fetchUpstream(
  req: Request,
  built: BuiltReading,
  config: PublicReadingConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  let cancelUpstreamBody: ((reason: unknown) => Promise<void>) | null = null
  const abortAll = (reason: unknown) => {
    controller.abort(reason)
    void cancelUpstreamBody?.(reason).catch(() => undefined)
  }
  const abortFromRequest = () => abortAll(req.signal.reason)
  if (req.signal.aborted) {
    abortFromRequest()
  } else {
    req.signal.addEventListener('abort', abortFromRequest, { once: true })
    if (req.signal.aborted) abortFromRequest()
  }
  let cleanedUp = false
  let timeout: ReturnType<typeof setTimeout>
  const resetIdleTimeout = () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      abortAll(new DOMException('Public reading upstream timed out.', 'TimeoutError'))
    }, timeoutMs)
  }
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    clearTimeout(timeout)
    req.signal.removeEventListener('abort', abortFromRequest)
    cancelUpstreamBody = null
  }
  resetIdleTimeout()

  try {
    const upstream = await fetchImpl(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        ...PUBLIC_READING_POLICIES[built.operation],
        messages: built.messages,
      }),
      signal: controller.signal,
    })
    if (controller.signal.aborted) {
      await upstream.body?.cancel(controller.signal.reason).catch(() => undefined)
      cleanup()
      throw new PublicReadingError(
        req.signal.aborted ? 499 : 504,
        req.signal.aborted ? 'request_aborted' : 'upstream_timeout',
      )
    }
    if (!upstream.ok) {
      cleanup()
      throw new PublicReadingError(
        upstream.status === 429 || upstream.status >= 500 ? 503 : 502,
        upstream.status === 429 || upstream.status >= 500
          ? 'upstream_unavailable'
          : 'upstream_failed',
      )
    }
    const upstreamMediaType = upstream.headers
      .get('Content-Type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (!upstream.body || upstreamMediaType !== 'text/event-stream') {
      await upstream.body?.cancel().catch(() => undefined)
      cleanup()
      throw new PublicReadingError(502, 'upstream_failed')
    }
    const reader = upstream.body.getReader()
    cancelUpstreamBody = async (reason) => {
      try {
        await reader.cancel(reason)
      } finally {
        cleanup()
      }
    }
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const chunk = await reader.read()
          if (chunk.done) {
            cleanup()
            streamController.close()
            return
          }
          resetIdleTimeout()
          streamController.enqueue(chunk.value)
        } catch (error) {
          cleanup()
          streamController.error(error)
        }
      },
      async cancel(reason) {
        controller.abort(reason)
        try {
          await reader.cancel(reason)
        } finally {
          cleanup()
        }
      },
    })
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    cleanup()
    if (error instanceof PublicReadingError) throw error
    if (req.signal.aborted) {
      throw new PublicReadingError(499, 'request_aborted')
    }
    if (controller.signal.aborted) {
      throw new PublicReadingError(504, 'upstream_timeout')
    }
    throw new PublicReadingError(502, 'upstream_failed')
  }
}

export async function handlePublicReading(
  req: Request,
  dependencies: PublicReadingDependencies = {},
): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      throw new PublicReadingError(405, 'method_not_allowed', { Allow: 'POST' })
    }
    const serverConfig = readConfig()
    requireSameOrigin(req, serverConfig.appOrigin)
    if (req.signal.aborted) {
      throw new PublicReadingError(499, 'request_aborted')
    }
    const parsedBody = await readStrictBody(req)
    const now = dependencies.now?.() ?? new Date()
    const reading = parseReading(parsedBody, now)
    const clientIp = normalizeClientIp(req.headers.get('x-forwarded-for'))
    const [globalSubjectHash, ipSubjectHash] = await Promise.all([
      hmacSubject(serverConfig.quotaHmacKey, 'public-ai-global:reading.v1'),
      hmacSubject(serverConfig.quotaHmacKey, `public-ai-ip:reading.v1:${clientIp}`),
    ])
    const quota = await (dependencies.claimQuota ?? claimQuota)(
      globalSubjectHash,
      ipSubjectHash,
      serverConfig.globalLimit,
      serverConfig.ipLimit,
      req.signal,
    )
    if (!quota.allowed) {
      throw new PublicReadingError(429, 'rate_limited', {
        'Retry-After': String(quota.retryAfterSeconds),
      })
    }
    if (req.signal.aborted) {
      throw new PublicReadingError(499, 'request_aborted')
    }
    const built = await buildReading(reading, now)
    if (req.signal.aborted) {
      throw new PublicReadingError(499, 'request_aborted')
    }
    return await fetchUpstream(
      req,
      built,
      serverConfig,
      dependencies.fetchImpl ?? fetch,
      dependencies.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS,
    )
  } catch (error) {
    return errorResponse(error)
  }
}
