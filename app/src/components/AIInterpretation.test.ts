// @vitest-environment jsdom

import { StrictMode, createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { ReadingApiError } from '@/lib/llm'
import { buildNatalReadingRequest } from '@/lib/reading-contract'
import {
  useChartStore,
  useContentCacheStore,
  useSettingsStore,
} from '@/stores'
import { AIInterpretation } from './AIInterpretation'

const mocks = vi.hoisted(() => ({
  streamReading: vi.fn(),
  startReading: vi.fn(),
  completeReading: vi.fn(),
}))

vi.mock('@/lib/llm', () => ({
  ReadingApiError: class ReadingApiError extends Error {},
  streamReading: mocks.streamReading,
}))

vi.mock('@/lib/analytics', () => ({
  analytics: {
    startReading: mocks.startReading,
    completeReading: mocks.completeReading,
  },
}))

vi.mock('@/components/FutureReportPaywall', () => ({
  FutureReportPaywall: () => null,
}))

vi.mock('@/components/SoulCard', () => ({
  SoulCard: () => null,
}))

vi.mock('@/components/EmailCapture', () => ({
  EmailCapture: () => null,
}))

vi.mock('@/components/LocalChartSnapshot', () => ({
  LocalChartSnapshot: () => createElement(
    'div',
    null,
    'LOCAL CHART SNAPSHOT',
  ),
}))

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 5,
  day: 12,
  hour: 9,
  gender: 'female',
  birthplace: 'Changsha',
  trueSolarEnabled: true,
  birthTimeReliable: true,
}

const CHART = {} as FunctionalAstrolabe

function getRequestKey(
  birthInfo: BirthInfo,
  persona: 'scholar' | 'sage',
): string {
  return JSON.stringify(buildNatalReadingRequest(birthInfo, persona))
}

function immediateStream(...tokens: string[]): AsyncIterable<string> {
  return (async function* () {
    for (const token of tokens) yield token
  })()
}

function deferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: () => resolvePromise?.(),
  }
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index++) {
      await Promise.resolve()
    }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'true')
  mocks.streamReading.mockReset()
  mocks.startReading.mockReset()
  mocks.completeReading.mockReset()
  useChartStore.setState({
    birthInfo: BIRTH_INFO,
    chart: CHART,
  })
  useSettingsStore.setState({ persona: 'scholar' })
  useContentCacheStore.setState({
    aiInterpretation: null,
    aiInterpretationKey: null,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('AIInterpretation public AI gate', () => {
  it('keeps the local snapshot visible when the optional AI layer is enabled', () => {
    render(createElement(AIInterpretation))

    expect(screen.getByText('LOCAL CHART SNAPSHOT')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Get My Free Reading' })).toBeTruthy()
  })

  it('shows a clear unavailable state and exposes no request action when disabled', () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'false')
    useContentCacheStore.setState({
      aiInterpretation: 'CACHED READING',
      aiInterpretationKey: getRequestKey(BIRTH_INFO, 'scholar'),
    })

    render(createElement(AIInterpretation))

    expect(screen.getByRole('status').textContent).toContain(
      'AI readings are temporarily unavailable.',
    )
    expect(screen.getByText('LOCAL CHART SNAPSHOT')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Get My Free Reading' })).toBeNull()
    expect(screen.queryByText('CACHED READING')).toBeNull()
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })
})

describe('AIInterpretation request ownership', () => {
  it('retries from an exact-key cached reading without reviving or appending OLD', async () => {
    const requestKey = getRequestKey(BIRTH_INFO, 'scholar')
    useContentCacheStore.setState({
      aiInterpretation: 'OLD',
      aiInterpretationKey: requestKey,
    })
    mocks.streamReading.mockReturnValue(immediateStream('N', 'E', 'W'))

    render(createElement(
      StrictMode,
      null,
      createElement(AIInterpretation),
    ))

    expect(screen.getByText('OLD')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Read Again' }))

    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()
    expect(screen.queryByText('OLD')).toBeNull()

    await flushAsyncWork()
    expect(useContentCacheStore.getState()).toMatchObject({
      aiInterpretation: 'NEW',
      aiInterpretationKey: requestKey,
    })

    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByText('NEW')).toBeTruthy()
    expect(screen.queryByText('OLDNEW')).toBeNull()
    expect(mocks.completeReading).toHaveBeenCalledTimes(1)
  })

  it('aborts and rejects late tokens and completion when persona changes', async () => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    mocks.streamReading.mockImplementation((
      _request: unknown,
      options: { signal?: AbortSignal },
    ) => {
      signal = options.signal
      return (async function* () {
        yield 'EARLY'
        await gate.promise
        yield 'STALE'
      })()
    })

    render(createElement(AIInterpretation))
    fireEvent.click(screen.getByRole('button', { name: 'Get My Free Reading' }))
    await flushAsyncWork()

    expect(
      (screen.getByRole('button', { name: 'The Old Sage' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    act(() => {
      useSettingsStore.getState().setPersona('sage')
    })
    await flushAsyncWork()

    expect(signal?.aborted).toBe(true)
    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()

    gate.resolve()
    await flushAsyncWork()
    act(() => vi.advanceTimersByTime(500))

    expect(screen.queryByText('EARLY')).toBeNull()
    expect(screen.queryByText('STALE')).toBeNull()
    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()
    expect(mocks.completeReading).not.toHaveBeenCalled()
  })

  it('aborts when the chart identity changes even if the serialized request is unchanged', async () => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    mocks.streamReading.mockImplementation((
      _request: unknown,
      options: { signal?: AbortSignal },
    ) => {
      signal = options.signal
      return (async function* () {
        await gate.promise
        yield 'STALE CHART'
      })()
    })

    render(createElement(AIInterpretation))
    fireEvent.click(screen.getByRole('button', { name: 'Get My Free Reading' }))
    await flushAsyncWork()

    act(() => {
      useChartStore.setState({
        birthInfo: BIRTH_INFO,
        chart: {} as FunctionalAstrolabe,
      })
    })
    await flushAsyncWork()

    expect(signal?.aborted).toBe(true)
    gate.resolve()
    await flushAsyncWork()

    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()
    expect(mocks.completeReading).not.toHaveBeenCalled()
  })

  it('aborts an active stream on StrictMode unmount and ignores its late token', async () => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    mocks.streamReading.mockImplementation((
      _request: unknown,
      options: { signal?: AbortSignal },
    ) => {
      signal = options.signal
      return (async function* () {
        await gate.promise
        yield 'TOO LATE'
      })()
    })

    const view = render(createElement(
      StrictMode,
      null,
      createElement(AIInterpretation),
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Get My Free Reading' }))
    await flushAsyncWork()

    view.unmount()
    expect(signal?.aborted).toBe(true)

    gate.resolve()
    await flushAsyncWork()
    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()
    expect(mocks.completeReading).not.toHaveBeenCalled()
  })

  it('keeps a failed retry cache-empty and the next retry contains only NEW', async () => {
    const requestKey = getRequestKey(BIRTH_INFO, 'scholar')
    useContentCacheStore.setState({
      aiInterpretation: 'OLD',
      aiInterpretationKey: requestKey,
    })
    mocks.streamReading
      .mockReturnValueOnce((async function* () {
        yield* []
        throw new Error('temporary failure')
      })())
      .mockReturnValueOnce(immediateStream('NEW'))

    render(createElement(AIInterpretation))
    fireEvent.click(screen.getByRole('button', { name: 'Read Again' }))
    await flushAsyncWork()

    const failure = screen.getByRole('alert')
    expect(failure.textContent).toBe(
      'The reading could not be completed. Please try again.',
    )
    expect(failure.textContent).not.toContain('temporary failure')
    expect(
      screen.getByRole('button', { name: 'Get My Free Reading' })
        .getAttribute('aria-describedby'),
    ).toBe('ai-reading-error')
    expect(screen.queryByText('OLD')).toBeNull()
    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Get My Free Reading' }))
    await flushAsyncWork()
    act(() => vi.advanceTimersByTime(500))

    expect(useContentCacheStore.getState()).toMatchObject({
      aiInterpretation: 'NEW',
      aiInterpretationKey: requestKey,
    })
    expect(screen.getByText('NEW')).toBeTruthy()
    expect(screen.queryByText('OLDNEW')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mocks.completeReading).toHaveBeenCalledTimes(1)
  })

  it('preserves a stable reading-service message', async () => {
    mocks.streamReading.mockReturnValue((async function* () {
      yield* []
      throw new ReadingApiError(
        'Please check your birth details.',
        'READING_INPUT_INVALID',
        422,
      )
    })())

    render(createElement(AIInterpretation))
    fireEvent.click(screen.getByRole('button', { name: 'Get My Free Reading' }))
    await flushAsyncWork()

    expect(screen.getByRole('alert').textContent).toBe(
      'Please check your birth details.',
    )
  })
})
