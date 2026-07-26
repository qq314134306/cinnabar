// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateChart,
  type BirthInfo,
  type FunctionalAstrolabe,
} from '@/lib/astro'
import * as birthTimeFinder from '@/lib/birth-time-finder'
import type {
  BirthTimeCandidate,
  BirthTimeQuestion,
} from '@/lib/birth-time-finder'
import { resolveBirthTime } from '@/lib/true-solar-time'
import { useChartStore, useContentCacheStore } from '@/stores'
import { BirthTimeSensitivity } from './BirthTimeSensitivity'

function birthInfo(reliable: boolean): BirthInfo {
  const info: BirthInfo = {
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    gender: 'male',
    trueSolarEnabled: false,
    birthTimeReliable: reliable,
  }
  return {
    ...info,
    resolvedBirthTime: resolveBirthTime({
      year: info.year,
      month: info.month,
      day: info.day,
      hour: info.hour,
      enabled: false,
    }),
  }
}

afterEach(() => {
  cleanup()
  useChartStore.setState({ birthInfo: null, chart: null })
  useContentCacheStore.getState().clearAll()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('BirthTimeSensitivity', () => {
  it('stays out of the recorded-time chart', () => {
    const info = birthInfo(true)
    useChartStore.setState({
      birthInfo: info,
      chart: generateChart(info),
    })

    const view = render(createElement(BirthTimeSensitivity))

    expect(view.container.textContent).toBe('')
  })

  it('shows three English local summaries for an approximate time', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const info = birthInfo(false)
    useChartStore.setState({
      birthInfo: info,
      chart: generateChart(info),
    })

    const view = render(createElement(BirthTimeSensitivity))

    expect(screen.getByRole('heading', {
      name: 'Birth-Time Sensitivity Check',
    })).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Earlier window',
    })).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Chart used',
    })).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Later window',
    })).toBeTruthy()
    expect(screen.getAllByText('Life Palace')).toHaveLength(3)
    expect(screen.getByRole('status').textContent).toContain(
      'does not determine the correct birth time',
    )
    expect(screen.getByRole('button', {
      name: 'Explore all time blocks with life events',
    })).toBeTruthy()
    expect(view.container.textContent).not.toMatch(/[\u3400-\u9fff]/u)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes a completely unknown hour directly to all 13 blocks', () => {
    const info = {
      ...birthInfo(false),
      birthTimeUnknown: true,
    }
    useChartStore.setState({
      birthInfo: info,
      chart: generateChart(info),
    })

    render(createElement(BirthTimeSensitivity))

    expect(screen.getByRole('heading', {
      name: 'Start With All 13 Time Blocks',
    })).toBeTruthy()
    expect(screen.queryByRole('heading', {
      name: 'Earlier window',
    })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(
      'No placeholder chart is shown.',
    )
    expect(screen.getByRole('button', {
      name: 'Explore all time blocks with life events',
    })).toBeTruthy()
  })

  it('lazy-loads the local shortlist only after its explicit entry action', async () => {
    const info = birthInfo(false)
    useChartStore.setState({
      birthInfo: info,
      chart: generateChart(info),
    })
    render(createElement(BirthTimeSensitivity))

    expect(screen.queryByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })).toBeNull()

    const trigger = screen.getByRole('button', {
      name: 'Explore all time blocks with life events',
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe('birth-time-finder')
    fireEvent.click(trigger)

    const heading = await screen.findByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })
    expect(heading).toBeTruthy()
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(heading.closest('section'))
    })
    fireEvent.click(screen.getByRole('button', {
      name: 'Close birth-time shortlist',
    }))
    expect(screen.queryByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })).toBeNull()
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', {
        name: 'Explore all time blocks with life events',
      }))
    })
  })

  it('atomically applies an explicit shortlist candidate and keeps it approximate', async () => {
    const info = birthInfo(false)
    const candidateInfo: BirthInfo = {
      ...info,
      hour: 10,
      birthplace: 'Chengdu',
      trueSolarEnabled: true,
      birthTimeReliable: false,
      resolvedBirthTime: {
        year: 1990,
        month: 1,
        day: 1,
        hour: 9,
        minute: 2,
        timeIndex: 5,
        originalShichen: '巳时',
        correctedShichen: '巳时',
        correctionMinutes: -58,
        applied: true,
        crossedDate: false,
        location: {
          name: '成都市',
          enName: 'Chengdu',
          longitude: 104.0665,
        },
      },
    }
    const candidates = [
      finderCandidate('snake', 'Snake Hour', '09:00–10:59', candidateInfo),
      finderCandidate('dog', 'Dog Hour', '19:00–20:59', {
        ...candidateInfo,
        hour: 20,
      }),
    ]
    vi.spyOn(birthTimeFinder, 'buildBirthTimeCandidates')
      .mockResolvedValue(candidates)
    vi.spyOn(birthTimeFinder, 'buildBirthTimeQuestionsAsync')
      .mockResolvedValue([
      finderQuestion('work', 'work'),
      finderQuestion('home', 'home'),
      finderQuestion('move', 'relocation'),
      ])
    useChartStore.setState({
      birthInfo: info,
      chart: generateChart(info),
    })
    useContentCacheStore.getState().setAiInterpretation('stale', 'stale-key')
    render(createElement(BirthTimeSensitivity))

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore all time blocks with life events',
    }))
    await screen.findByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })
    fireEvent.change(screen.getByLabelText('Exact local birthplace'), {
      target: { value: 'Chengdu' },
    })
    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))
    await screen.findByText('Question 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Use Snake Hour, 09:00–10:59',
    }))

    expect(useChartStore.getState().birthInfo).toEqual(candidateInfo)
    expect(useChartStore.getState().chart).toBe(candidates[0].chart)
    expect(useChartStore.getState().birthInfo?.birthTimeReliable).toBe(false)
    expect(useContentCacheStore.getState().aiInterpretation).toBeNull()
    expect(screen.getAllByRole('status').some((status) => (
      status.textContent?.includes(
        'Chart updated to Snake Hour. The birth time remains marked approximate.',
      )
    ))).toBe(true)
    expect(screen.queryByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })).toBeNull()
  })

  it('contains a local comparison failure and retries without hiding the chart', () => {
    const info = birthInfo(false)
    const actualChart = generateChart(info)
    let shouldFail = true
    const unstableChart = {
      fiveElementsClass: actualChart.fiveElementsClass,
      get palaces() {
        if (shouldFail) throw new Error('private chart detail')
        return actualChart.palaces
      },
    } as unknown as FunctionalAstrolabe
    useChartStore.setState({
      birthInfo: info,
      chart: unstableChart,
    })
    render(createElement(BirthTimeSensitivity))

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      "We couldn't build this comparison. Your main chart above is unchanged.",
    )
    expect(alert.textContent).not.toContain('private chart detail')

    shouldFail = false
    fireEvent.click(screen.getByRole('button', {
      name: 'Retry time comparison',
    }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('heading', {
      name: 'Chart used',
    })).toBeTruthy()
  })
})

function finderCandidate(
  id: string,
  label: string,
  range: string,
  info: BirthInfo,
): BirthTimeCandidate {
  const resolved = info.resolvedBirthTime ?? resolveBirthTime({
    year: info.year,
    month: info.month,
    day: info.day,
    hour: info.hour,
    enabled: false,
  })
  return {
    id,
    block: {
      id,
      label,
      range,
      hour: info.hour,
      daypart: info.hour < 17 ? 'morning' : 'evening',
    },
    input: {
      year: info.year,
      month: info.month,
      day: info.day,
      hour: info.hour,
    },
    birthInfo: info,
    resolved,
    chart: generateChart(info),
    groupKey: id,
  }
}

function finderQuestion(
  id: string,
  domain: BirthTimeQuestion['domain'],
): BirthTimeQuestion {
  return {
    id,
    domain,
    startYear: 2017,
    endYear: 2019,
    prompt: `Did ${domain} change?`,
    signals: { snake: 1, dog: -1 },
    discrimination: 100,
  }
}
