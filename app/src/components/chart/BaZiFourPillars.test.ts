// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BirthInfo } from '@/lib/astro'
import { BaZiFourPillars } from './BaZiFourPillars'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
  trueSolarEnabled: false,
  birthTimeReliable: true,
  resolvedBirthTime: {
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0,
    timeIndex: 6,
    originalShichen: '午时',
    correctedShichen: '午时',
    correctionMinutes: 0,
    applied: false,
    crossedDate: false,
    location: null,
  },
}

afterEach(cleanup)

describe('BaZiFourPillars', () => {
  it('renders four translated pillars and the Day Master', () => {
    const { container } = render(createElement(BaZiFourPillars, {
      birthInfo: BIRTH_INFO,
    }))

    expect(screen.getByRole('heading', {
      name: 'BaZi · Four Pillars',
    })).toBeTruthy()
    expect(container.querySelectorAll('[data-bazi-pillar]')).toHaveLength(4)
    expect(container.querySelector(
      '[data-bazi-pillar="year"]',
    )?.textContent).toContain('Ji-Si')
    expect(container.querySelector(
      '[data-bazi-pillar="month"]',
    )?.textContent).toContain('Bing-Zi')
    expect(container.querySelector(
      '[data-bazi-pillar="day"]',
    )?.textContent).toContain('Bing-Yin')
    expect(container.querySelector(
      '[data-bazi-pillar="hour"]',
    )?.textContent).toContain('Jia-Wu')
    expect(container.querySelector(
      '[data-bazi-day-master]',
    )?.textContent).toContain('Bing · Yang Fire')
    expect(screen.getByText(
      /Year Pillar uses the Li Chun boundary/,
    )).toBeTruthy()
  })

  it('marks the Hour Pillar provisional for an approximate time', () => {
    render(createElement(BaZiFourPillars, {
      birthInfo: {
        ...BIRTH_INFO,
        birthTimeReliable: false,
      },
    }))

    expect(screen.getByRole('note').textContent).toContain(
      'Hour Pillar is provisional',
    )
  })

  it('does not fabricate pillars without a resolved birth time', () => {
    const { container } = render(createElement(BaZiFourPillars, {
      birthInfo: {
        ...BIRTH_INFO,
        resolvedBirthTime: undefined,
      },
    }))

    expect(container.childElementCount).toBe(0)
  })
})
