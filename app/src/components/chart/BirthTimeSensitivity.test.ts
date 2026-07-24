// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateChart,
  type BirthInfo,
  type FunctionalAstrolabe,
} from '@/lib/astro'
import { resolveBirthTime } from '@/lib/true-solar-time'
import { useChartStore } from '@/stores'
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
    expect(view.container.textContent).not.toMatch(/[\u3400-\u9fff]/u)
    expect(fetchMock).not.toHaveBeenCalled()
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
