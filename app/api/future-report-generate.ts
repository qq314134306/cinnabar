/**
 * [INPUT]: Authenticated POST { purchaseId } for a verified paid entitlement
 * [OUTPUT]: An idempotently stored paid Future Report
 * [POS]: Recoverable server-side generation path; retries never recapture payment
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  buildFutureReportPrompt,
  buildSystemPrompt,
} from '../src/lib/ai-prompts'
import {
  FUTURE_REPORT_TABLE,
  type FutureReportPurchaseRow,
  parseExactRequestObject,
  requireFutureReportPaymentsEnabled,
} from './_future-report'
import { assertTrustedGenerationInput } from './_future-report-chart'
import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireUser,
} from './_require-user'
import { getSupabaseAdmin } from './_supabase-admin'

export const config = { runtime: 'nodejs' }

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MAX_BODY_LENGTH = 1_000
const MAX_UPSTREAM_BODY_BYTES = 512 * 1_024
const MAX_REPORT_CHARACTERS = 100_000
const DEEPSEEK_DEADLINE_MS = 45_000
const FAILURE_CLEANUP_DEADLINE_MS = 7_000
const PURCHASE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const FUTURE_REPORT_DEEPSEEK_POLICY = Object.freeze({
  model: 'deepseek-chat',
  stream: false,
  max_tokens: 1_600,
  temperature: 0.65,
})

interface GenerationUser {
  id: string
}

export interface FutureReportGenerationStore {
  loadPurchase(purchaseId: string, userId: string): Promise<FutureReportPurchaseRow | null>
  claimPurchase(
    purchaseId: string,
    userId: string,
    generationStartedAt: string,
  ): Promise<FutureReportPurchaseRow>
  saveReport(
    purchaseId: string,
    generationStartedAt: string,
    report: string,
    generationCompletedAt: string,
  ): Promise<string>
  failGeneration(
    purchaseId: string,
    generationStartedAt: string,
    signal: AbortSignal,
  ): Promise<void>
}

export interface FutureReportGenerationDependencies {
  authenticate?: (req: Request) => Promise<GenerationUser>
  store?: FutureReportGenerationStore
  fetchImpl?: typeof fetch
  now?: () => Date
  deepSeekDeadlineMs?: number
  cleanupDeadlineMs?: number
}

class DeepSeekDeadlineError extends Error {
  constructor() {
    super('DeepSeek deadline exceeded.')
    this.name = 'DeepSeekDeadlineError'
  }
}

class DeepSeekRequestAbortedError extends Error {
  constructor() {
    super('DeepSeek request aborted.')
    this.name = 'DeepSeekRequestAbortedError'
  }
}

function errorMessage(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message
  }
  return ''
}

function createDefaultStore(): FutureReportGenerationStore {
  return {
    async loadPurchase(purchaseId, userId) {
      const selected = await getSupabaseAdmin()
        .from(FUTURE_REPORT_TABLE)
        .select('*')
        .eq('id', purchaseId)
        .eq('user_id', userId)
        .maybeSingle()
      if (selected.error) throw selected.error
      return selected.data as FutureReportPurchaseRow | null
    },

    async claimPurchase(purchaseId, userId, generationStartedAt) {
      const claimed = await getSupabaseAdmin()
        .rpc('claim_future_report_generation', {
          p_purchase_id: purchaseId,
          p_user_id: userId,
          p_generation_started_at: generationStartedAt,
        })
        .single()
      if (claimed.error) throw claimed.error
      if (!claimed.data) throw new Error('Future Report generation claim returned no row.')
      return claimed.data as FutureReportPurchaseRow
    },

    async saveReport(
      purchaseId,
      generationStartedAt,
      report,
      generationCompletedAt,
    ) {
      const saved = await getSupabaseAdmin()
        .from(FUTURE_REPORT_TABLE)
        .update({
          generated_report: report,
          generation_status: 'completed',
          generation_completed_at: generationCompletedAt,
        })
        .eq('id', purchaseId)
        .eq('payment_status', 'completed')
        .eq('generation_status', 'generating')
        .eq('generation_started_at', generationStartedAt)
        .select('generated_report')
        .single()
      if (saved.error) throw saved.error
      if (typeof saved.data?.generated_report !== 'string') {
        throw new Error('Future Report generation save returned no report.')
      }
      return saved.data.generated_report
    },

    async failGeneration(purchaseId, generationStartedAt, signal) {
      const failed = await getSupabaseAdmin()
        .rpc('fail_future_report_generation', {
          p_purchase_id: purchaseId,
          p_generation_started_at: generationStartedAt,
        })
        .abortSignal(signal)
      if (failed.error) throw failed.error
    },
  }
}

function upstreamStatusError(status: number): HttpError {
  if (status === 429 || status >= 500) {
    return new HttpError(
      'Report generation is temporarily unavailable.',
      503,
      'REPORT_GENERATION_UPSTREAM_UNAVAILABLE',
    )
  }
  return new HttpError(
    'Report generation received an invalid upstream response.',
    502,
    'REPORT_GENERATION_UPSTREAM_FAILED',
  )
}

function invalidUpstreamResponse(): HttpError {
  return new HttpError(
    'Report generation received an invalid upstream response.',
    502,
    'REPORT_GENERATION_INVALID_RESPONSE',
  )
}

async function readBoundedJsonBody(
  response: Response,
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array> | null) => void,
): Promise<unknown> {
  const mediaType = response.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== 'application/json' || !response.body) {
    void response.body?.cancel().catch(() => undefined)
    throw invalidUpstreamResponse()
  }

  const contentLength = response.headers.get('Content-Length')
  if (
    contentLength
    && /^[0-9]+$/.test(contentLength)
    && Number(contentLength) > MAX_UPSTREAM_BODY_BYTES
  ) {
    void response.body.cancel().catch(() => undefined)
    throw invalidUpstreamResponse()
  }

  const reader = response.body.getReader()
  onReader(reader)
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > MAX_UPSTREAM_BODY_BYTES) {
        void reader.cancel().catch(() => undefined)
        throw invalidUpstreamResponse()
      }
      chunks.push(chunk.value)
    }
  } finally {
    onReader(null)
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
    throw invalidUpstreamResponse()
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw invalidUpstreamResponse()
  }
}

function readReport(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidUpstreamResponse()
  }
  const completion = value as {
    choices?: unknown
  }
  if (!Array.isArray(completion.choices) || completion.choices.length !== 1) {
    throw invalidUpstreamResponse()
  }
  const choice = completion.choices[0]
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
    throw invalidUpstreamResponse()
  }
  const message = (choice as { message?: unknown }).message
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw invalidUpstreamResponse()
  }
  const report = (message as { content?: unknown }).content
  if (
    typeof report !== 'string'
    || !report.trim()
    || report.length > MAX_REPORT_CHARACTERS
  ) {
    throw invalidUpstreamResponse()
  }
  return report
}

async function requestDeepSeekReport(
  req: Request,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  fetchImpl: typeof fetch,
  deadlineMs: number,
): Promise<string> {
  if (req.signal.aborted) {
    throw new HttpError(
      'Report generation was interrupted.',
      503,
      'REPORT_GENERATION_INTERRUPTED',
    )
  }

  const controller = new AbortController()
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let rejectBoundary: ((error: Error) => void) | null = null
  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject
  })
  const stop = (error: Error) => {
    rejectBoundary?.(error)
    rejectBoundary = null
    controller.abort(error)
    void upstreamReader?.cancel(error).catch(() => undefined)
  }
  const abortFromRequest = () => stop(new DeepSeekRequestAbortedError())
  req.signal.addEventListener('abort', abortFromRequest, { once: true })
  if (req.signal.aborted) abortFromRequest()
  const timeout = setTimeout(() => stop(new DeepSeekDeadlineError()), deadlineMs)

  const operation = (async () => {
    const upstream = await fetchImpl(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...FUTURE_REPORT_DEEPSEEK_POLICY,
        messages,
      }),
      signal: controller.signal,
    })
    if (!upstream.ok) {
      void upstream.body?.cancel().catch(() => undefined)
      throw upstreamStatusError(upstream.status)
    }
    const body = await readBoundedJsonBody(upstream, (reader) => {
      upstreamReader = reader
    })
    return readReport(body)
  })()

  try {
    return await Promise.race([operation, boundary])
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof DeepSeekRequestAbortedError || req.signal.aborted) {
      throw new HttpError(
        'Report generation was interrupted.',
        503,
        'REPORT_GENERATION_INTERRUPTED',
      )
    }
    if (error instanceof DeepSeekDeadlineError) {
      throw new HttpError(
        'Report generation timed out.',
        503,
        'REPORT_GENERATION_TIMEOUT',
      )
    }
    throw new HttpError(
      'Report generation could not reach the upstream service.',
      502,
      'REPORT_GENERATION_UPSTREAM_FAILED',
    )
  } finally {
    clearTimeout(timeout)
    req.signal.removeEventListener('abort', abortFromRequest)
    rejectBoundary = null
  }
}

async function safelyMarkGenerationFailed(
  store: FutureReportGenerationStore,
  purchaseId: string,
  generationStartedAt: string,
  deadlineMs: number,
): Promise<void> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error('Future Report failure cleanup timed out.')
      controller.abort(error)
      reject(error)
    }, deadlineMs)
  })
  try {
    await Promise.race([
      store.failGeneration(purchaseId, generationStartedAt, controller.signal),
      deadline,
    ])
  } catch {
    console.error(JSON.stringify({
      level: 'error',
      event: 'future_report_generation_failure_cleanup_failed',
    }))
  } finally {
    clearTimeout(timeout!)
  }
}

function claimHttpError(error: unknown): HttpError | null {
  const message = errorMessage(error)
  if (message.includes('future_report_generation_in_progress')) {
    return new HttpError(
      'Your report is already being generated.',
      409,
      'GENERATION_IN_PROGRESS',
    )
  }
  if (message.includes('future_report_generation_backoff')) {
    return new HttpError(
      'Please wait before retrying report generation.',
      429,
      'GENERATION_BACKOFF',
    )
  }
  if (message.includes('future_report_generation_attempt_limit')) {
    return new HttpError(
      'Automatic report retries are exhausted. Please contact support.',
      429,
      'GENERATION_ATTEMPT_LIMIT',
    )
  }
  return null
}

export async function handleFutureReportGenerate(
  req: Request,
  dependencies: FutureReportGenerationDependencies = {},
): Promise<Response> {
  let claimedPurchaseId: string | null = null
  let claimedGenerationStartedAt: string | null = null
  const store = dependencies.store ?? createDefaultStore()
  const now = dependencies.now ?? (() => new Date())

  try {
    requireFutureReportPaymentsEnabled()
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405)
    }
    const user = await (dependencies.authenticate ?? requireUser)(req)
    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_LENGTH) {
      throw new HttpError('Request body too large.', 413)
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      throw new HttpError('Invalid JSON body.', 400)
    }
    const body = parseExactRequestObject(parsedBody, ['purchaseId'])
    if (typeof body.purchaseId !== 'string' || !PURCHASE_ID_RE.test(body.purchaseId)) {
      throw new HttpError('A valid purchase ID is required.', 400)
    }

    let row = await store.loadPurchase(body.purchaseId, user.id)
    if (!row) throw new HttpError('Future Report purchase was not found.', 404)
    if (row.payment_status !== 'completed') {
      throw new HttpError('Payment has not been verified yet.', 409)
    }
    if (row.generation_status === 'completed' && row.generated_report) {
      return jsonResponse({ report: row.generated_report }, 200)
    }
    if (!row.generation_input) {
      throw new HttpError('The saved report input is unavailable. Please contact support.', 409)
    }
    assertTrustedGenerationInput(
      row.generation_input,
      row.tier,
      row.chart_fingerprint,
    )
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey || apiKey.length > 512) {
      throw new HttpError(
        'Report generation is temporarily unavailable.',
        503,
        'REPORT_GENERATION_UNAVAILABLE',
      )
    }

    const generationStartedAt = now().toISOString()
    try {
      const purchaseId = row.id
      row = await store.claimPurchase(
        purchaseId,
        user.id,
        generationStartedAt,
      )
      claimedPurchaseId = purchaseId
      claimedGenerationStartedAt = generationStartedAt
    } catch (error) {
      throw claimHttpError(error) ?? error
    }

    assertTrustedGenerationInput(
      row.generation_input,
      row.tier,
      row.chart_fingerprint,
    )
    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt(row.generation_input.persona),
      },
      {
        role: 'user',
        content: buildFutureReportPrompt(
          row.generation_input.chartFacts,
          row.generation_input.yearlyFacts,
          row.tier,
        ),
      },
    ]
    const report = await requestDeepSeekReport(
      req,
      apiKey,
      messages,
      dependencies.fetchImpl ?? fetch,
      dependencies.deepSeekDeadlineMs ?? DEEPSEEK_DEADLINE_MS,
    )
    const savedReport = await store.saveReport(
      row.id,
      generationStartedAt,
      report,
      now().toISOString(),
    )
    claimedPurchaseId = null
    claimedGenerationStartedAt = null

    return jsonResponse({ report: savedReport }, 200)
  } catch (error) {
    if (claimedPurchaseId && claimedGenerationStartedAt) {
      await safelyMarkGenerationFailed(
        store,
        claimedPurchaseId,
        claimedGenerationStartedAt,
        dependencies.cleanupDeadlineMs ?? FAILURE_CLEANUP_DEADLINE_MS,
      )
    }
    return errorResponse(error)
  }
}

export default async function handler(req: Request): Promise<Response> {
  return handleFutureReportGenerate(req)
}
