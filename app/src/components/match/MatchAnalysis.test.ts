// @vitest-environment jsdom

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useChartStore,
  useFutureReportActivityStore,
  useSettingsStore,
} from '@/stores'
import { generateChart, type BirthInfo } from '@/lib/astro'
import { buildCompatibilityReadingRequest } from '@/lib/reading-contract'
import * as compatibilityScore from '@/lib/compatibility-score'
import * as trueSolarTime from '@/lib/true-solar-time'
import type { ResolvedBirthTime } from '@/lib/true-solar-time'
import { MatchAnalysis } from './MatchAnalysis'

const mocks = vi.hoisted(() => ({
  streamReading: vi.fn(),
  ReadingApiError: class ReadingApiError extends Error {
    readonly code: string
    readonly status: number

    constructor(message: string, code: string, status: number) {
      super(message)
      this.name = 'ReadingApiError'
      this.code = code
      this.status = status
    }
  },
}))

vi.mock('@/lib/llm', () => ({
  ReadingApiError: mocks.ReadingApiError,
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
  useChartStore.setState({ birthInfo: null, chart: null })
  useFutureReportActivityStore.setState({ captureCount: 0 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('MatchAnalysis public AI gate', () => {
  it('disables persona changes while PayPal capture is pending', () => {
    useFutureReportActivityStore.getState().beginCapture()
    render(createElement(MatchAnalysis))

    const sageButton = screen.getByRole('button', { name: 'The Old Sage' }) as
      HTMLButtonElement
    expect(sageButton.disabled).toBe(true)
    expect(sageButton.title).toContain('Finish PayPal payment verification')
    fireEvent.click(sageButton)
    expect(useSettingsStore.getState().persona).toBe('scholar')
  })

  it('prefills Person A and resolves its true solar time again for comparison', async () => {
    const currentBirthInfo: BirthInfo = {
      year: 1986,
      month: 7,
      day: 19,
      hour: 23,
      gender: 'female',
      birthplace: 'New York',
      trueSolarEnabled: true,
      birthTimeReliable: true,
      resolvedBirthTime: {
        year: 1986,
        month: 7,
        day: 19,
        hour: 22,
        minute: 4,
        timeIndex: 11,
        originalShichen: 'Rat Hour',
        correctedShichen: 'Pig Hour',
        correctionMinutes: -56,
        applied: true,
        crossedDate: false,
        location: {
          name: 'New York',
          country: 'United States',
          tz: 'America/New_York',
          longitude: -74.006,
        },
      },
    }
    useChartStore.setState({
      birthInfo: currentBirthInfo,
      chart: generateChart(currentBirthInfo),
    })
    const compare = vi.spyOn(compatibilityScore, 'compareBirthCharts')

    render(createElement(MatchAnalysis))

    expect(screen.getByRole('status').textContent).toContain(
      'Using Your Chart details',
    )
    expect((screen.getByRole('combobox', {
      name: 'Person A year of birth',
    }) as HTMLSelectElement).value).toBe('1986')
    expect((screen.getByRole('combobox', {
      name: 'Person A birth hour',
    }) as HTMLSelectElement).value).toBe('23')
    expect((screen.getByRole('textbox', {
      name: 'Person A birthplace',
    }) as HTMLInputElement).value).toBe('New York')
    expect(screen.getByRole('checkbox', {
      name: 'Person A apply true solar time',
    })).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'Person A Female' })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.queryByText(/Local compatibility snapshot/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    await vi.waitFor(() => expect(compare).toHaveBeenCalledOnce())
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({
        year: 1986,
        month: 7,
        day: 19,
        hour: 23,
        gender: 'female',
        birthplace: 'New York',
        trueSolarEnabled: true,
        resolvedBirthTime: expect.objectContaining({
          applied: true,
          location: expect.objectContaining({ enName: 'New York' }),
        }),
      }),
      expect.objectContaining({
        year: 1992,
        month: 6,
        day: 15,
        hour: 14,
        gender: 'female',
      }),
    )
    expect(screen.getByRole('status', {
      name: 'True solar time resolution',
    }).textContent).toContain('True solar time adjusted')
  })

  it('does not prefill compatibility from an unknown-hour placeholder', () => {
    const unknownBirthInfo: BirthInfo = {
      year: 1986,
      month: 7,
      day: 19,
      hour: 12,
      gender: 'female',
      birthplace: 'New York',
      trueSolarEnabled: false,
      birthTimeReliable: false,
      birthTimeUnknown: true,
    }
    useChartStore.setState({
      birthInfo: unknownBirthInfo,
      chart: generateChart(unknownBirthInfo),
    })

    render(createElement(MatchAnalysis))

    expect(screen.queryByText(/Using Your Chart details/)).toBeNull()
    expect((screen.getByRole('combobox', {
      name: 'Person A year of birth',
    }) as HTMLSelectElement).value).toBe('1990')
    expect((screen.getByRole('combobox', {
      name: 'Person A birth hour',
    }) as HTMLSelectElement).value).toBe('12')
  })

  it('re-resolves edited inputs and can restore the latest current-chart details', async () => {
    const currentBirthInfo: BirthInfo = {
      year: 1988,
      month: 2,
      day: 29,
      hour: 8,
      gender: 'male',
      birthplace: 'Shanghai',
      trueSolarEnabled: true,
      birthTimeReliable: true,
    }
    useChartStore.setState({
      birthInfo: currentBirthInfo,
      chart: generateChart(currentBirthInfo),
    })

    render(createElement(MatchAnalysis))
    const personAHour = screen.getByRole('combobox', {
      name: 'Person A birth hour',
    }) as HTMLSelectElement

    fireEvent.change(personAHour, { target: { value: '10' } })

    expect(screen.getByRole('status').textContent).toContain('Edited details')
    expect(screen.getByRole('status').textContent).toContain(
      'Date, time, and birthplace changes are resolved again when you compare.',
    )
    expect(screen.getByRole('button', { name: 'Use My Chart' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))
    expect(await screen.findByText(/Local compatibility snapshot/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Use My Chart' }))

    expect(personAHour.value).toBe('8')
    expect(screen.getByRole('status').textContent).toContain(
      'Using Your Chart details',
    )
    expect(screen.queryByRole('button', { name: 'Use My Chart' })).toBeNull()
    expect(screen.queryByText(/Local compatibility snapshot/)).toBeNull()
  })

  it('keeps standalone Compatibility available when no chart is loaded', () => {
    render(createElement(MatchAnalysis))

    expect(screen.getByRole('status').textContent).toContain(
      'No chart is loaded',
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Enter both people manually—local comparison still works.',
    )
    expect(screen.queryByRole('button', { name: 'Use My Chart' })).toBeNull()
  })

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
      expect(screen.getByRole('textbox', {
        name: `${person} birthplace`,
      })).toBeTruthy()
      expect(screen.getByRole('checkbox', {
        name: `${person} apply true solar time`,
      })).toBeTruthy()
    }

    const ids = screen.getAllByRole('combobox').map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows a clear unavailable state and exposes no request action for an invalid value', () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'TRUE')

    render(createElement(MatchAnalysis))

    expect(screen.getByText(/AI readings are temporarily unavailable/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add AI Reading' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Compare Locally' })).toBeTruthy()
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })

  it('builds the local comparison while public AI is disabled', async () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(createElement(MatchAnalysis))
    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect(await screen.findByText(
      `Local compatibility snapshot · ${new Date().getFullYear()}`,
    )).toBeTruthy()
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    expect(screen.getByRole('heading', {
      name: 'BaZi compatibility · Four Pillars',
    })).toBeTruthy()
    expect(document.querySelectorAll('[data-bazi-pillar]')).toHaveLength(8)
    expect(screen.getByText(/does not change the Zi Wei compatibility score/)).toBeTruthy()
    expect(document.querySelectorAll('[data-bazi-compatibility-person]')).toHaveLength(2)
    expect(screen.getByText(/not scientific evidence/)).toBeTruthy()
    expect(mocks.streamReading).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops when an enabled solar-time birthplace cannot be matched', async () => {
    const compare = vi.spyOn(compatibilityScore, 'compareBirthCharts')
    render(createElement(MatchAnalysis))

    fireEvent.change(screen.getByRole('textbox', {
      name: 'Person B birthplace',
    }), {
      target: { value: 'Atlantis' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Person B birthplace could not be matched.',
    )
    expect(compare).not.toHaveBeenCalled()
    expect(screen.queryByText(/Local compatibility snapshot/)).toBeNull()
  })

  it('uses the entered hour when solar correction is turned off', async () => {
    render(createElement(MatchAnalysis))
    fireEvent.change(screen.getByRole('textbox', {
      name: 'Person B birthplace',
    }), {
      target: { value: 'Atlantis' },
    })
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'Person B apply true solar time',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect(await screen.findByText(/Local compatibility snapshot/)).toBeTruthy()
    expect(screen.getByRole('status', {
      name: 'True solar time resolution',
    }).textContent).toContain(
      'True solar correction is off; the selected birth-hour band was used as entered.',
    )
  })

  it('keeps a completed local comparison when only the AI persona changes', async () => {
    render(createElement(MatchAnalysis))
    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))
    expect(await screen.findByText(/Local compatibility snapshot/)).toBeTruthy()

    act(() => {
      useSettingsStore.getState().setPersona('sage')
    })
    await flushAsyncWork()

    expect(screen.getByText(/Local compatibility snapshot/)).toBeTruthy()
  })

  it('rejects late solar-resolution work after a person input changes', async () => {
    const resolvers: Array<(value: ResolvedBirthTime) => void> = []
    vi.spyOn(trueSolarTime, 'resolveBirthTimeAsync').mockImplementation(() => (
      new Promise((resolve) => resolvers.push(resolve))
    ))
    const compare = vi.spyOn(compatibilityScore, 'compareBirthCharts')
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))
    expect(resolvers).toHaveLength(2)
    fireEvent.change(screen.getByRole('combobox', {
      name: 'Person A birth hour',
    }), {
      target: { value: '10' },
    })

    const resolved: ResolvedBirthTime = {
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      timeIndex: 6,
      originalShichen: 'Horse Hour',
      correctedShichen: 'Horse Hour',
      correctionMinutes: 0,
      applied: false,
      crossedDate: false,
      location: null,
    }
    await act(async () => {
      for (const resolve of resolvers) resolve(resolved)
      await Promise.resolve()
    })

    expect(compare).not.toHaveBeenCalled()
    expect(screen.queryByText(/Local compatibility snapshot/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Compare Locally' })).toBeTruthy()
  })

  it('announces a recoverable local comparison failure', async () => {
    vi.spyOn(compatibilityScore, 'compareBirthCharts')
      .mockImplementationOnce(() => {
        throw new Error('Check both birth dates and try again.')
      })
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Compare Locally' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Check both birth dates and try again.',
    )
  })
})

describe('MatchAnalysis request ownership', () => {
  it('rejects late AI preflight work after the persona changes', async () => {
    const resolvers: Array<(value: ResolvedBirthTime) => void> = []
    vi.spyOn(trueSolarTime, 'resolveBirthTimeAsync').mockImplementation(() => (
      new Promise((resolve) => resolvers.push(resolve))
    ))
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    expect(resolvers).toHaveLength(2)

    act(() => {
      useSettingsStore.getState().setPersona('sage')
    })

    const resolved: ResolvedBirthTime = {
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      timeIndex: 6,
      originalShichen: 'Horse Hour',
      correctedShichen: 'Horse Hour',
      correctionMinutes: 0,
      applied: false,
      crossedDate: false,
      location: null,
    }
    await act(async () => {
      for (const resolve of resolvers) resolve(resolved)
      await Promise.resolve()
    })

    expect(mocks.streamReading).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('blocks an unmatched birthplace before starting an AI request', async () => {
    render(createElement(MatchAnalysis))
    fireEvent.change(screen.getByRole('textbox', {
      name: 'Person B birthplace',
    }), {
      target: { value: 'Atlantis' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Person B birthplace could not be matched.',
    )
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })

  it('uses the same visible current-chart fields for the strict AI request', async () => {
    const currentBirthInfo: BirthInfo = {
      year: 1977,
      month: 11,
      day: 3,
      hour: 6,
      gender: 'female',
      birthplace: 'Tokyo',
      trueSolarEnabled: true,
      birthTimeReliable: false,
    }
    useChartStore.setState({
      birthInfo: currentBirthInfo,
      chart: generateChart(currentBirthInfo),
    })
    mocks.streamReading.mockReturnValue(immediateStream('PREFILLED'))

    render(createElement(MatchAnalysis))
    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()

    expect(mocks.streamReading).toHaveBeenCalledWith(
      buildCompatibilityReadingRequest(
        {
          year: 1977,
          month: 11,
          day: 3,
          hour: 6,
          gender: 'female',
          birthplace: 'Tokyo',
          trueSolarEnabled: true,
          birthTimeReliable: false,
        },
        {
          year: 1992,
          month: 6,
          day: 15,
          hour: 14,
          gender: 'female',
          trueSolarEnabled: true,
          birthTimeReliable: true,
        },
        'scholar',
      ),
      { signal: expect.any(AbortSignal) },
    )
  })

  it('renders only the successful stream for the exact compatibility contract', async () => {
    mocks.streamReading.mockReturnValue(immediateStream('N', 'E', 'W'))
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()

    expect(screen.getByText('NEW')).toBeTruthy()
    expect(mocks.streamReading).toHaveBeenCalledWith(
      buildCompatibilityReadingRequest(
        {
          year: 1990,
          month: 1,
          day: 1,
          hour: 12,
          gender: 'male',
          trueSolarEnabled: true,
          birthTimeReliable: true,
        },
        {
          year: 1992,
          month: 6,
          day: 15,
          hour: 14,
          gender: 'female',
          trueSolarEnabled: true,
          birthTimeReliable: true,
        },
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
    expect(screen.getByText('The analysis failed. Please try again.')).toBeTruthy()
    expect(screen.queryByText('temporary failure')).toBeNull()
    expect(screen.queryByText('OLD')).toBeNull()

    fireEvent.click(analyze)
    await flushAsyncWork()
    expect(screen.getByText('NEW')).toBeTruthy()
    expect(screen.queryByText('OLDNEW')).toBeNull()
  })

  it('preserves stable server-owned AI error copy', async () => {
    mocks.streamReading.mockReturnValue((async function* () {
      yield* []
      throw new mocks.ReadingApiError(
        'Public readings are currently unavailable.',
        'unavailable',
        503,
      )
    })())
    render(createElement(MatchAnalysis))

    fireEvent.click(screen.getByRole('button', { name: 'Add AI Reading' }))
    await flushAsyncWork()

    expect(screen.getByText('Public readings are currently unavailable.')).toBeTruthy()
  })
})
