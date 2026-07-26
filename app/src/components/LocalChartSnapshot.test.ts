// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateChart, type BirthInfo } from '@/lib/astro'
import { useChartStore } from '@/stores'
import { LocalChartSnapshot } from './LocalChartSnapshot'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
}

beforeEach(() => {
  useChartStore.setState({
    birthInfo: BIRTH_INFO,
    chart: generateChart(BIRTH_INFO),
  })
})

afterEach(() => {
  cleanup()
})

describe('LocalChartSnapshot', () => {
  it('renders an English four-dimension snapshot without an external request', () => {
    render(createElement(LocalChartSnapshot))

    expect(screen.getByRole('heading', {
      name: /Tian|Zi Wei|Sun|Moon|General|Emperor|soul/i,
    })).toBeTruthy()
    expect(screen.getByText(
      `Local chart snapshot · ${new Date().getFullYear()}`,
    )).toBeTruthy()
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    expect(screen.getByText(/calculated locally from the chart/)).toBeTruthy()
  })

  it('renders nothing before a chart exists', () => {
    useChartStore.setState({ birthInfo: null, chart: null })
    const view = render(createElement(LocalChartSnapshot))

    expect(view.container.textContent).toBe('')
  })
})
