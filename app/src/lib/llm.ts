import {
  serializeReadingRequest,
  type ReadingRequest,
} from './reading-contract'
import {
  isPublicAiReadingEnabled,
  PUBLIC_AI_UNAVAILABLE_MESSAGE,
} from './public-ai'

const INTERPRET_ENDPOINT = '/api/interpret'

export interface StreamReadingOptions {
  signal?: AbortSignal
}

interface ReadingErrorEnvelope {
  error: {
    code: string
    message: string
  }
}

export class ReadingApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ReadingApiError'
    this.code = code
    this.status = status
  }
}

function isReadingErrorEnvelope(value: unknown): value is ReadingErrorEnvelope {
  if (!value || typeof value !== 'object') return false
  const error = Reflect.get(value, 'error')
  return Boolean(
    error &&
    typeof error === 'object' &&
    typeof Reflect.get(error, 'code') === 'string' &&
    typeof Reflect.get(error, 'message') === 'string',
  )
}

async function toReadingApiError(response: Response): Promise<ReadingApiError> {
  const body: unknown = await response.json().catch(() => null)
  if (isReadingErrorEnvelope(body)) {
    return new ReadingApiError(
      body.error.message,
      body.error.code,
      response.status,
    )
  }

  return new ReadingApiError(
    'The reading service is unavailable right now. Please try again.',
    'READING_REQUEST_FAILED',
    response.status,
  )
}

interface ParsedSseEvent {
  content: string[]
  done: boolean
}

function parseSseEvent(event: string): ParsedSseEvent {
  const data = event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')

  if (!data) return { content: [], done: false }
  if (data.trim() === '[DONE]') return { content: [], done: true }

  try {
    const payload: unknown = JSON.parse(data)
    if (!payload || typeof payload !== 'object') {
      return { content: [], done: false }
    }
    const choices = Reflect.get(payload, 'choices')
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
      return { content: [], done: false }
    }
    const delta = Reflect.get(choices[0], 'delta')
    if (!delta || typeof delta !== 'object') {
      return { content: [], done: false }
    }
    const content = Reflect.get(delta, 'content')
    return typeof content === 'string' && content
      ? { content: [content], done: false }
      : { content: [], done: false }
  } catch {
    return { content: [], done: false }
  }
}

function takeSseEvent(buffer: string): { event: string; rest: string } | null {
  const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer)
  if (!boundary || boundary.index === undefined) return null

  return {
    event: buffer.slice(0, boundary.index),
    rest: buffer.slice(boundary.index + boundary[0].length),
  }
}

/** Streams a server-owned reading. The browser can only submit reading.v1 inputs. */
export async function* streamReading(
  request: ReadingRequest,
  options: StreamReadingOptions = {},
): AsyncGenerator<string> {
  if (!isPublicAiReadingEnabled()) {
    throw new ReadingApiError(
      PUBLIC_AI_UNAVAILABLE_MESSAGE,
      'PUBLIC_AI_READINGS_DISABLED',
      503,
    )
  }

  const response = await fetch(INTERPRET_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(serializeReadingRequest(request)),
    signal: options.signal,
  })

  if (!response.ok) {
    throw await toReadingApiError(response)
  }
  if (!response.body) {
    throw new ReadingApiError(
      'The reading service returned an empty response. Please try again.',
      'READING_STREAM_MISSING',
      response.status,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        break
      }

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const next = takeSseEvent(buffer)
        if (!next) break
        buffer = next.rest

        const parsed = parseSseEvent(next.event)
        for (const content of parsed.content) yield content
        if (parsed.done) return
      }
    }

    if (buffer.trim()) {
      const parsed = parseSseEvent(buffer)
      for (const content of parsed.content) yield content
    }
  } finally {
    reader.releaseLock()
  }
}
