// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { useChartStore, useContentCacheStore } from '@/stores'
import { LifeKLine } from './LifeKLine'

const mocks = vi.hoisted(() => ({
  generateLifetimeKLines: vi.fn(),
}))

vi.mock('@/lib/fortune-score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fortune-score')>()
  return {
    ...actual,
    generateLifetimeKLines: mocks.generateLifetimeKLines,
  }
})

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => (
    createElement('div', null, children)
  )
  return {
    Bar: Container,
    CartesianGrid: Container,
    ComposedChart: Container,
    Label: Container,
    LabelList: Container,
    ReferenceLine: Container,
    ResponsiveContainer: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  }
})

vi.mock('./ScoreRadar', () => ({
  ScoreRadar: ({ period }: { period: string }) => (
    createElement('div', { 'data-testid': 'score-radar' }, period)
  ),
}))

const BIRTH_YEAR = new Date().getFullYear()

const BIRTH_INFO: BirthInfo = {
  year: BIRTH_YEAR,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'female',
}

const POINTS = [
  {
    age: 1,
    year: BIRTH_YEAR,
    ganZhi: '甲子',
    daYun: '童限',
    daYunRange: '1-5',
    open: 50,
    close: 55,
    high: 60,
    low: 45,
    score: 53,
    dimensions: { career: 50, wealth: 51, relationship: 52, health: 53 },
    yearlyMutagens: ['紫微化禄'],
  },
  {
    age: 2,
    year: BIRTH_YEAR + 1,
    ganZhi: '乙丑',
    daYun: '丙寅',
    daYunRange: '6-15',
    open: 55,
    close: 48,
    high: 58,
    low: 42,
    score: 51,
    dimensions: { career: 49, wealth: 50, relationship: 51, health: 52 },
    yearlyMutagens: [],
  },
  {
    age: 100,
    year: BIRTH_YEAR + 99,
    ganZhi: '癸卯',
    daYun: '甲辰',
    daYunRange: '96-105',
    open: 48,
    close: 50,
    high: 54,
    low: 44,
    score: 49,
    dimensions: { career: 48, wealth: 49, relationship: 50, health: 51 },
    yearlyMutagens: [],
  },
]

beforeEach(() => {
  mocks.generateLifetimeKLines.mockReset()
  mocks.generateLifetimeKLines.mockReturnValue(POINTS)
  useChartStore.setState({
    birthInfo: BIRTH_INFO,
    chart: {} as FunctionalAstrolabe,
  })
  useContentCacheStore.getState().clearAll()
})

afterEach(() => {
  cleanup()
})

describe('Life Timeline', () => {
  it('sends an empty-state user back to chart creation', () => {
    useChartStore.setState({ birthInfo: null, chart: null })
    const onRequestChart = vi.fn()

    render(createElement(LifeKLine, { onRequestChart }))

    expect(screen.getByText(
      'Create your birth chart before opening Life Timeline.',
    )).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Your Chart' }))
    expect(onRequestChart).toHaveBeenCalledOnce()
  })

  it('builds the deterministic timeline and lets the user inspect any year', async () => {
    render(createElement(LifeKLine))

    fireEvent.click(screen.getByRole('button', {
      name: 'Build My Life Timeline',
    }))

    expect(mocks.generateLifetimeKLines).toHaveBeenCalledWith(
      useChartStore.getState().chart,
      BIRTH_YEAR,
    )
    expect(screen.getByRole('combobox', { name: 'Choose a year' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Age 100/ })).toBeNull()
    expect((await screen.findByTestId('score-radar')).textContent).toBe(
      `${BIRTH_YEAR} (Age 1)`,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Choose a year' }), {
      target: { value: '2' },
    })

    expect(screen.getByTestId('score-radar').textContent).toBe(
      `${BIRTH_YEAR + 1} (Age 2)`,
    )
    expect(screen.getByText(/Yi-Chou/)).toBeTruthy()
    expect(screen.getByText('51 / 100')).toBeTruthy()
    expect(screen.getByText(/does not estimate lifespan/)).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Timeline range' }), {
      target: { value: 'full' },
    })
    expect(screen.getByRole('option', { name: /Age 100/ })).toBeTruthy()
  })
})
