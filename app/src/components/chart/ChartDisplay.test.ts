// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { useChartStore } from '@/stores'
import { ChartDisplay } from './ChartDisplay'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
}

const CHART = {
  chineseDate: '己巳年 十二月初五',
  time: '午时',
  timeRange: '11:00-13:00',
  fiveElementsClass: '土五局',
  soul: '天机',
  body: '天梁',
  zodiac: '蛇',
  sign: '摩羯座',
  palaces: [
    {
      name: '命宫',
      heavenlyStem: '辛',
      earthlyBranch: '巳',
      majorStars: [{ name: '天梁' }],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [5, 14] },
      boshi12: '博士',
      changsheng12: '临官',
      isBodyPalace: false,
    },
    {
      name: '财帛',
      heavenlyStem: '壬',
      earthlyBranch: '午',
      majorStars: [],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [15, 24] },
      boshi12: '力士',
      changsheng12: '帝旺',
      isBodyPalace: false,
    },
  ],
} as unknown as FunctionalAstrolabe

beforeEach(() => {
  useChartStore.setState({
    birthInfo: BIRTH_INFO,
    chart: CHART,
  })
})

afterEach(() => {
  cleanup()
  useChartStore.setState({ birthInfo: null, chart: null })
})

describe('ChartDisplay palace explanations', () => {
  it('opens a local reflective guide from a semantic palace button', () => {
    render(createElement(ChartDisplay))

    const palaceButton = screen.getByRole('button', {
      name: 'Explain Life Palace',
    })

    expect(palaceButton.tagName).toBe('BUTTON')
    expect(palaceButton.getAttribute('aria-pressed')).toBe('false')
    expect(palaceButton.getAttribute('aria-controls')).toBeNull()

    fireEvent.click(palaceButton)

    expect(palaceButton.getAttribute('aria-pressed')).toBe('true')
    expect(palaceButton.getAttribute('aria-controls')).toBe(
      'selected-palace-explanation',
    )
    expect(screen.getByRole('heading', {
      name: 'About the Life Palace',
    })).toBeTruthy()
    expect(screen.getByText(
      'A lens on self-expression, identity, habits, and the way you approach life.',
    )).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: /Tian Liang/,
    })).toBeTruthy()
    expect(screen.getByText(
      /One palace or star never defines an outcome/,
    )).toBeTruthy()

    fireEvent.click(screen.getByRole('button', {
      name: 'Close palace explanation',
    }))

    expect(screen.queryByRole('heading', {
      name: 'About the Life Palace',
    })).toBeNull()
    expect(palaceButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('replaces the selected guide and explains an empty major-star space', () => {
    render(createElement(ChartDisplay))

    fireEvent.click(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Explain Wealth Palace',
    }))

    expect(screen.queryByRole('heading', {
      name: 'About the Life Palace',
    })).toBeNull()
    expect(screen.getByRole('heading', {
      name: 'About the Wealth Palace',
    })).toBeTruthy()
    expect(screen.getByText(
      /This palace has no major star/,
    )).toBeTruthy()
  })

  it('toggles the same palace guide closed without leaving stale content', () => {
    render(createElement(ChartDisplay))

    const palaceButton = screen.getByRole('button', {
      name: 'Explain Life Palace',
    })
    fireEvent.click(palaceButton)
    fireEvent.click(palaceButton)

    expect(screen.queryByRole('heading', {
      name: 'About the Life Palace',
    })).toBeNull()
    expect(palaceButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('labels an approximate chart and exposes its local sensitivity check', () => {
    useChartStore.setState({
      birthInfo: {
        ...BIRTH_INFO,
        trueSolarEnabled: false,
        birthTimeReliable: false,
      },
      chart: CHART,
    })

    render(createElement(ChartDisplay))

    expect(screen.getByText(
      /Horse Hour 11:00-13:00 · Approximate/,
    )).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Birth-Time Sensitivity Check',
    })).toBeTruthy()
  })
})
