// @vitest-environment jsdom

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/stores'
import { buildCompatibilityReadingRequest } from '@/lib/reading-contract'
import * as compatibilityScore from '@/lib/compatibility-score'
import { MatchAnalysis } from './MatchAnalysis'

const mocks = vi.hoisted(() => ({
  streamReading: vi.fn(),
}))

vi.mock('@/lib/llm', () => ({
  streamReading: mocks.streamReading,
}))

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
  vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'true')
  mocks.streamReading.mockReset()
  useSettingsStore.setState({ persona: 'scholar' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('MatchAnalysis public AI gate', () => {
  it('uniquely names both people and every birth input', () => {
    render(createElement(MatchAnalysis))

    for (const person of ['Person A', 'Person B']) {
      expect(screen.getByRole('combobox', {
        name: `${person} year of birth`,
      })).toBeTruthy()
      expect(screen.getByRole('combobox', {
        name: `${person} month of birth`,
      })).toBeTruthy()
      expect(screen.getByRole('combobox', {
        name: `${person} day of birth`,
      })).toBeTruthy()
      expect(screen.getByRole('combobox', {
        name: `${person} birth hour`,
      })).toBeTruthy()
      expect(screen.getByRole('radio', { name: `${person} Male` })).toBeTruthy()
      expect(screen.getByRole('radio', { name: `${person} Female` })).toBeTruthy()
    }

    const ids = screen.getAllByRole('combobox').map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows a clear unavailable state and exposes no request action for an invalid value', () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'TRUE')

    render(createElement(MatchAnalysis))

    expect(screen.getByRole('status').textContent).toContain(
      'AI readings are temporarily unavailable.',
    )
    expect(screen.queryByRole('button', { name: 'Add AI Reading' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Compare Locally' })).toBeTruthy()
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })

  it('builds the local comparison while public AI is disabled', () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', '')

    render(createElement(MatchAnalysis))
    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect(screen.getByText(
      `Local compatibility snapshot · ${new Date().getFullYear()}`,
    )).toBeTruthy()
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    expect(screen.getByText(/not scientific evidence/)).toBeTruthy()
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })

  it('announces a recoverable local comparison failure', () => {
    vi.spyOn(compatibilityScore, 'compareBirthCharts')
      .mockImplementationOnce(() => {
        throw new Error('Check both birth dates and try again.')
      })
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect(screen.getByRole('alert').textContent).toContain(
      'Check both birth dates and try again.',
    )
  })
})

describe('MatchAnalysis request ownership', () => {
  it('renders only the successful stream for the exact compatibility contract', async () => {
    mocks.streamReading.mockReturnValue(immediateStream('N', 'E', 'W'))
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()

    expect(screen.getByText('NEW')).toBeTruthy()
    expect(mocks.streamReading).toHaveBeenCalledWith(
      buildCompatibilityReadingRequest(
        { year: 1990, month: 1, day: 1, hour: 12, gender: 'male' },
        { year: 1992, month: 6, day: 15, hour: 14, gender: 'female' },
        'scholar',
      ),
      { signal: expect.any(AbortSignal) },
    )
  })

  it('aborts and rejects late tokens when persona changes programmatically', async () => {
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
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()
    expect(
      (screen.getByRole('button', { name: 'The Old Sage' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    act(() => {
      useSettingsStore.getState().setPersona('sage')
    })
    await flushAsyncWork()

    expect(signal?.aborted).toBe(true)
    gate.resolve()
    await flushAsyncWork()
    expect(screen.queryByText('EARLY')).toBeNull()
    expect(screen.queryByText('STALE')).toBeNull()
  })

  it.each([
    ['Person A', 0, '1989'],
    ['Person B', 4, '1991'],
  ])('aborts a delayed stream when %s input changes', async (
    _person,
    selectIndex,
    year,
  ) => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    mocks.streamReading.mockImplementation((
      _request: unknown,
      options: { signal?: AbortSignal },
    ) => {
      signal = options.signal
      return (async function* () {
        yield 'EARLY INPUT'
        await gate.promise
        yield 'STALE INPUT'
      })()
    })
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()
    const select = screen.getAllByRole('combobox')[selectIndex] as HTMLSelectElement
    expect(select.disabled).toBe(true)

    fireEvent.change(select, { target: { value: year } })
    await flushAsyncWork()

    expect(signal?.aborted).toBe(true)
    expect(screen.queryByText('EARLY INPUT')).toBeNull()
    gate.resolve()
    await flushAsyncWork()
    expect(screen.queryByText('STALE INPUT')).toBeNull()
  })

  it('aborts on same-key input identity replacement', async () => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    mocks.streamReading.mockImplementation((
      _request: unknown,
      options: { signal?: AbortSignal },
    ) => {
      signal = options.signal
      return (async function* () {
        yield 'EARLY IDENTITY'
        await gate.promise
        yield 'STALE IDENTITY'
      })()
    })
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()
    const personAYear = screen.getAllByRole('combobox')[0] as HTMLSelectElement

    fireEvent.change(personAYear, { target: { value: '1990' } })
    await flushAsyncWork()

    expect(signal?.aborted).toBe(true)
    expect(screen.queryByText('EARLY IDENTITY')).toBeNull()
    gate.resolve()
    await flushAsyncWork()
    expect(screen.queryByText('STALE IDENTITY')).toBeNull()
  })

  it('aborts on unmount and ignores a late token', async () => {
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
    const view = render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()
    view.unmount()
    expect(signal?.aborted).toBe(true)

    gate.resolve()
    await flushAsyncWork()
    expect(screen.queryByText('TOO LATE')).toBeNull()
  })

  it('clears OLD for a failed retry and the next success contains only NEW', async () => {
    mocks.streamReading
      .mockReturnValueOnce(immediateStream('OLD'))
      .mockReturnValueOnce((async function* () {
        yield* []
        throw new Error('temporary failure')
      })())
      .mockReturnValueOnce(immediateStream('NEW'))
    render(createElement(MatchAnalysis))
    const analyze = screen.getByRole('button', { name: 'Add AI Reading' })

    fireEvent.click(analyze)
    await flushAsyncWork()
    expect(screen.getByText('OLD')).toBeTruthy()

    fireEvent.click(analyze)
    await flushAsyncWork()
    expect(screen.getByText('temporary failure')).toBeTruthy()
    expect(screen.queryByText('OLD')).toBeNull()

    fireEvent.click(analyze)
    await flushAsyncWork()
    expect(screen.getByText('NEW')).toBeTruthy()
    expect(screen.queryByText('OLDNEW')).toBeNull()
  })
})
