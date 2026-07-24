// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import type { TimingLensChartInput } from '@/lib/timing-lens'
import { TimingLens } from './TimingLens'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
}

function createChart(): TimingLensChartInput {
  return {
    palaces: [
      {
        name: '命宫',
        earthlyBranch: '巳',
        majorStars: [{ name: '天梁' }],
        minorStars: [],
        decadal: { range: [5, 14] },
      },
      {
        name: '官禄',
        earthlyBranch: '酉',
        majorStars: [{ name: '紫微' }],
        minorStars: [{ name: '文昌' }],
        decadal: { range: [25, 34] },
      },
      {
        name: '迁移',
        earthlyBranch: '亥',
        majorStars: [{ name: '天机' }],
        minorStars: [],
        decadal: { range: [35, 44] },
      },
      {
        name: '福德',
        earthlyBranch: '丑',
        majorStars: [{ name: '武曲' }],
        minorStars: [],
        decadal: { range: [45, 54] },
      },
    ],
    horoscope: () => ({
      decadal: {
        heavenlyStem: '戊',
        earthlyBranch: '辰',
        palaceNames: ['夫妻', '兄弟', '命宫', '父母'],
        mutagen: ['武曲', '紫微', '文昌', '天机'],
      },
      yearly: {
        heavenlyStem: '丙',
        earthlyBranch: '午',
        palaceNames: ['命宫', '父母', '福德', '田宅'],
        mutagen: ['天梁', '紫微', '文昌', '天机'],
      },
    }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-24T12:00:00Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimingLens', () => {
  it('navigates engine-owned Major Limit and annual structure', () => {
    const onSelectPalace = vi.fn()
    const onContextChange = vi.fn()

    render(createElement(TimingLens, {
      chart: createChart() as unknown as FunctionalAstrolabe,
      birthInfo: BIRTH_INFO,
      onSelectPalace,
      onContextChange,
    }))

    expect(screen.getByRole('heading', {
      name: 'Major Limit & Year Lens',
    })).toBeTruthy()
    expect(screen.getByText(
      /does not predict outcomes or lifespan/,
    )).toBeTruthy()
    expect(screen.getByText('2026 · Model age 37')).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Major Limit',
    })).toBeTruthy()
    expect(screen.getByText(/Ages 35–44/)).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Annual 2026',
    })).toBeTruthy()

    const annualLu = screen.getByRole('button', {
      name: 'Open Annual 2026 Lu transformation on Tian Liang in Life Palace',
    })
    fireEvent.click(annualLu)
    expect(onSelectPalace).toHaveBeenCalledWith('命宫')

    const yearSelect = screen.getByRole('combobox', {
      name: 'Timing lens year',
    })
    expect(yearSelect.querySelectorAll('option')).toHaveLength(100)
    fireEvent.change(yearSelect, { target: { value: '2027' } })

    expect(onContextChange).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2027 · Model age 38')).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Annual 2027',
    })).toBeTruthy()
  })

  it('keeps year navigation inside the disclosed 1–100 model', () => {
    render(createElement(TimingLens, {
      chart: createChart() as unknown as FunctionalAstrolabe,
      birthInfo: BIRTH_INFO,
      onSelectPalace: vi.fn(),
      onContextChange: vi.fn(),
    }))

    const yearSelect = screen.getByRole('combobox', {
      name: 'Timing lens year',
    })
    fireEvent.change(yearSelect, { target: { value: '1990' } })
    expect(screen.getByRole('button', {
      name: 'Previous timing lens year',
    }).hasAttribute('disabled')).toBe(true)

    fireEvent.change(yearSelect, { target: { value: '2089' } })
    expect(screen.getByRole('button', {
      name: 'Next timing lens year',
    }).hasAttribute('disabled')).toBe(true)
  })

  it('shows a fixed local fallback when engine timing data is unavailable', () => {
    const chart = createChart()
    chart.horoscope = () => {
      throw new Error('engine unavailable')
    }

    render(createElement(TimingLens, {
      chart: chart as unknown as FunctionalAstrolabe,
      birthInfo: BIRTH_INFO,
      onSelectPalace: vi.fn(),
      onContextChange: vi.fn(),
    }))

    expect(screen.getByRole('status').textContent).toContain(
      'Timing structure is unavailable',
    )
  })
})
