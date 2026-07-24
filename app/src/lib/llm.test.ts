import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo } from './astro'
import { ReadingApiError, streamReading } from './llm'
import {
  isPublicAiReadingEnabled,
  PUBLIC_AI_UNAVAILABLE_MESSAGE,
} from './public-ai'
import {
  buildCompatibilityReadingRequest,
  buildNatalReadingRequest,
  buildYearlyReadingRequest,
  serializeBasicBirthInfo,
  serializeFullBirthInfo,
  type ReadingRequest,
} from './reading-contract'

const birthInfo: BirthInfo = {
  year: 1990,
  month: 4,
  day: 18,
  hour: 23,
  gender: 'female',
  birthplace: '  Taipei  ',
  resolvedBirthTime: {
    year: 1990,
    month: 4,
    day: 19,
    hour: 0,
    minute: 12,
    timeIndex: 0,
    originalShichen: 'Rat Hour',
    correctedShichen: 'Rat Hour',
    correctionMinutes: 72,
    applied: true,
    crossedDate: true,
    location: {
      name: 'private derived location',
      latitude: 25,
      longitude: 121,
      tz: 'Asia/Taipei',
    },
  },
  isLeapMonth: true,
  fixLeap: false,
}

const request: ReadingRequest = buildNatalReadingRequest(birthInfo, 'sage')

function responseFromBytes(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let result = ''
  for await (const token of stream) result += token
  return result
}

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'true')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('public AI client gate', () => {
  it('enables readings only for the exact string true', () => {
    expect(isPublicAiReadingEnabled('true')).toBe(true)

    for (const value of [null, '', false, true, 'false', 'TRUE', 'True', '1', ' true', 'true ']) {
      expect(isPublicAiReadingEnabled(value)).toBe(false)
    }

    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', undefined)
    expect(isPublicAiReadingEnabled()).toBe(false)
  })

  it('fails before fetch when the client flag is disabled', async () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'false')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(collect(streamReading(request))).rejects.toEqual(
      new ReadingApiError(
        PUBLIC_AI_UNAVAILABLE_MESSAGE,
        'PUBLIC_AI_READINGS_DISABLED',
        503,
      ),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('reading.v1 browser contract', () => {
  it('serializes full birth data with safe defaults and excludes derived chart state', () => {
    expect(serializeFullBirthInfo(birthInfo)).toEqual({
      year: 1990,
      month: 4,
      day: 18,
      hour: 23,
      gender: 'female',
      birthplace: 'Taipei',
      trueSolarEnabled: true,
      birthTimeReliable: false,
    })
  })

  it('omits birthplace from the wire contract when solar correction is off', () => {
    expect(serializeFullBirthInfo({
      ...birthInfo,
      trueSolarEnabled: false,
    })).toEqual({
      year: 1990,
      month: 4,
      day: 18,
      hour: 23,
      gender: 'female',
      trueSolarEnabled: false,
      birthTimeReliable: false,
    })
  })

  it('retains the legacy five-field projection without derived metadata', () => {
    expect(serializeBasicBirthInfo({
      ...birthInfo,
      trueSolarEnabled: false,
      birthTimeReliable: true,
    })).toEqual({
      year: 1990,
      month: 4,
      day: 18,
      hour: 23,
      gender: 'female',
    })
  })

  it('builds the exact natal, compatibility, and yearly discriminated requests', () => {
    const natal = buildNatalReadingRequest(birthInfo, 'sage')
    const compatibility = buildCompatibilityReadingRequest(
      birthInfo,
      { ...birthInfo, gender: 'male' },
      'scholar',
    )
    const yearly = buildYearlyReadingRequest(birthInfo, 2030)

    expect(natal).toMatchObject({
      version: 'reading.v1',
      operation: 'natal',
      persona: 'sage',
    })
    expect(compatibility).toEqual({
      version: 'reading.v1',
      operation: 'compatibility',
      persona: 'scholar',
      personA: {
        year: 1990,
        month: 4,
        day: 18,
        hour: 23,
        gender: 'female',
        birthplace: 'Taipei',
        trueSolarEnabled: true,
        birthTimeReliable: false,
      },
      personB: {
        year: 1990,
        month: 4,
        day: 18,
        hour: 23,
        gender: 'male',
        birthplace: 'Taipei',
        trueSolarEnabled: true,
        birthTimeReliable: false,
      },
    })
    expect(yearly).toMatchObject({
      version: 'reading.v1',
      operation: 'yearly',
      persona: 'scholar',
      year: 2030,
    })

    for (const body of [natal, compatibility, yearly].map((value) => JSON.stringify(value))) {
      expect(body).not.toContain('messages')
      expect(body).not.toContain('prompt')
      expect(body).not.toContain('facts')
      expect(body).not.toContain('resolvedBirthTime')
      expect(body).not.toContain('latitude')
      expect(body).not.toContain('longitude')
      expect(body).not.toContain('timezone')
    }
  })

  it('posts only the strict request body and forwards the abort signal', async () => {
    const controller = new AbortController()
    const taintedRequest = {
      ...request,
      messages: [{ role: 'user', content: 'must not leave browser' }],
      prompt: 'must not leave browser',
      facts: 'must not leave browser',
      birth: {
        ...request.birth,
        resolvedBirthTime: birthInfo.resolvedBirthTime,
      },
    } as ReadingRequest
    const fetchMock = vi.fn().mockResolvedValue(responseFromBytes([
      new TextEncoder().encode('data: [DONE]\n\n'),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamReading(taintedRequest, { signal: controller.signal }))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/interpret')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
    })
    expect(JSON.parse(init.body)).toEqual(request)
  })
})

describe('reading SSE client', () => {
  it('parses events across chunks, multi-line data, UTF-8 boundaries, and [DONE]', async () => {
    const source = [
      'data: {"choices":[\n',
      'data: {"delta":{"content":"命"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"盘"}}]}\n\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
    ].join('')
    const bytes = new TextEncoder().encode(source)
    const splitInsideFirstCharacter = bytes.indexOf(0xe5) + 1
    const chunks = [
      bytes.slice(0, 7),
      bytes.slice(7, splitInsideFirstCharacter),
      bytes.slice(splitInsideFirstCharacter, splitInsideFirstCharacter + 1),
      bytes.slice(splitInsideFirstCharacter + 1, 53),
      bytes.slice(53),
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFromBytes(chunks)))

    await expect(collect(streamReading(request))).resolves.toBe('命盘')
  })

  it('parses a final SSE event without a trailing blank line', async () => {
    const tail = 'data: {"choices":[{"delta":{"content":"tail"}}]}'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFromBytes([
      new TextEncoder().encode(tail),
    ])))

    await expect(collect(streamReading(request))).resolves.toBe('tail')
  })

  it('preserves the stable non-2xx error code, message, and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'READING_INVALID_REQUEST',
        message: 'Please check your birth details.',
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(collect(streamReading(request))).rejects.toEqual(
      new ReadingApiError(
        'Please check your birth details.',
        'READING_INVALID_REQUEST',
        400,
      ),
    )
  })

  it('uses a friendly stable fallback for malformed error responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })))

    await expect(collect(streamReading(request))).rejects.toMatchObject({
      name: 'ReadingApiError',
      code: 'READING_REQUEST_FAILED',
      status: 503,
      message: 'The reading service is unavailable right now. Please try again.',
    })
  })

  it('supports AbortSignal cancellation', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }, { once: true })
      })
    )))

    const pending = collect(streamReading(request, { signal: controller.signal }))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
