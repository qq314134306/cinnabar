// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { useChartStore, useContentCacheStore } from '@/stores'
import { YearlyFortune } from './YearlyFortune'

const mocks = vi.hoisted(() => ({
  streamReading: vi.fn(),
}))

vi.mock('@/lib/llm', () => ({
  streamReading: mocks.streamReading,
}))

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 4,
  day: 18,
  hour: 12,
  gender: 'female',
}

const CHART = {} as FunctionalAstrolabe

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', 'true')
  mocks.streamReading.mockReset()
  useChartStore.setState({
    birthInfo: BIRTH_INFO,
    chart: CHART,
  })
  useContentCacheStore.setState({ yearlyFortune: {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('YearlyFortune public AI gate', () => {
  it('shows a clear unavailable state and exposes no generation action by default', () => {
    vi.stubEnv('VITE_ENABLE_PUBLIC_AI_READINGS', '')
    useContentCacheStore.setState({
      yearlyFortune: { [new Date().getFullYear()]: 'CACHED YEARLY READING' },
    })

    render(createElement(YearlyFortune))

    expect(screen.getByRole('status').textContent).toContain(
      'AI readings are temporarily unavailable.',
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('CACHED YEARLY READING')).toBeNull()
    expect(mocks.streamReading).not.toHaveBeenCalled()
  })
})
