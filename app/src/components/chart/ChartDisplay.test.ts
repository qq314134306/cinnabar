// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  generateChart,
  type BirthInfo,
  type FunctionalAstrolabe,
} from '@/lib/astro'
import { useChartStore } from '@/stores'
import { ChartDisplay } from './ChartDisplay'

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

const CHART = {
  chineseDate: '己巳年 十二月初五',
  time: '午时',
  timeRange: '11:00-13:00',
  fiveElementsClass: '土五局',
  soul: '天机',
  body: '天梁',
  zodiac: '蛇',
  sign: '摩羯座',
  horoscope: () => ({
    decadal: {
      heavenlyStem: '戊',
      earthlyBranch: '辰',
      palaceNames: ['夫妻', '兄弟', '父母', '命宫', '福德'],
      mutagen: ['武曲', '紫微', '天梁', '天机'],
    },
    yearly: {
      heavenlyStem: '丙',
      earthlyBranch: '午',
      palaceNames: ['财帛', '命宫', '夫妻', '兄弟', '父母'],
      mutagen: ['天梁', '紫微', '武曲', '天机'],
    },
  }),
  palaces: [
    {
      name: '命宫',
      heavenlyStem: '辛',
      earthlyBranch: '巳',
      majorStars: [{ name: '天梁', mutagen: '科' }],
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
    {
      name: '官禄',
      heavenlyStem: '癸',
      earthlyBranch: '酉',
      majorStars: [{ name: '紫微', mutagen: '权' }],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [25, 34] },
      boshi12: '青龙',
      changsheng12: '冠带',
      isBodyPalace: false,
    },
    {
      name: '迁移',
      heavenlyStem: '甲',
      earthlyBranch: '亥',
      majorStars: [{ name: '天机', mutagen: '忌' }],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [35, 44] },
      boshi12: '小耗',
      changsheng12: '长生',
      isBodyPalace: false,
    },
    {
      name: '福德',
      heavenlyStem: '乙',
      earthlyBranch: '丑',
      majorStars: [{ name: '武曲', mutagen: '禄' }],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [45, 54] },
      boshi12: '将军',
      changsheng12: '养',
      isBodyPalace: false,
    },
    {
      name: '子女',
      heavenlyStem: '戊',
      earthlyBranch: '辰',
      majorStars: [],
      minorStars: [],
      adjectiveStars: [],
      decadal: { range: [55, 64] },
      boshi12: '奏书',
      changsheng12: '沐浴',
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
    const { container } = render(createElement(ChartDisplay))

    expect(screen.getByRole('heading', {
      name: 'BaZi · Four Pillars',
    })).toBeTruthy()
    expect(container.querySelector(
      '[data-bazi-day-master]',
    )?.textContent).toContain('Bing · Yang Fire')

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

  it('highlights and summarizes the selected palace four-palace structure', () => {
    const { container } = render(createElement(ChartDisplay))

    fireEvent.click(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }))

    expect(screen.getByRole('heading', {
      name: 'San Fang Si Zheng · Four-palace view',
    })).toBeTruthy()
    expect(screen.getByText(
      /This organizes context; it does not calculate strength/,
    )).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }).getAttribute('data-palace-relation')).toBe('focus')
    expect(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }).getAttribute('aria-describedby')).toBe('palace-relation-巳')
    expect(screen.getByRole('button', {
      name: 'Explain Career Palace',
    }).getAttribute('data-palace-relation')).toBe('trine')
    expect(screen.getByRole('button', {
      name: 'Explain Travel Palace',
    }).getAttribute('data-palace-relation')).toBe('opposite')
    expect(screen.getByRole('button', {
      name: 'Explain Fortune Palace',
    }).getAttribute('data-palace-relation')).toBe('trine')
    expect(screen.getByRole('button', {
      name: 'Explain Wealth Palace',
    }).getAttribute('data-palace-relation')).toBeNull()
    expect(container.querySelectorAll('[data-relation-summary]')).toHaveLength(4)
    expect(screen.getByRole('heading', {
      name: 'Flanking Palaces · Adjacent context',
    })).toBeTruthy()
    expect(screen.getByText(
      /This shows structural context only; it does not classify/,
    )).toBeTruthy()
    expect(container.querySelectorAll('[data-flanking-summary]')).toHaveLength(2)
    expect(container.querySelector(
      '[data-flanking-summary="previous"]',
    )?.textContent).toContain('Children Palace')
    expect(container.querySelector(
      '[data-flanking-summary="next"]',
    )?.textContent).toContain('Wealth Palace')

    fireEvent.click(screen.getByRole('button', {
      name: 'Close palace explanation',
    }))
    expect(container.querySelectorAll('[data-palace-relation]')).toHaveLength(0)
  })

  it('maps the selected palace transformations and navigates to a destination palace', () => {
    const palacesWithOrigins = CHART.palaces.map((palace) => ({ ...palace }))
    palacesWithOrigins[0] = {
      ...palacesWithOrigins[0],
      mutagedPlaces: () => [
        palacesWithOrigins[5],
        palacesWithOrigins[2],
        palacesWithOrigins[4],
        palacesWithOrigins[3],
      ],
    }
    const chartWithOrigins = {
      ...CHART,
      palaces: palacesWithOrigins,
    } as unknown as FunctionalAstrolabe
    useChartStore.setState({
      birthInfo: BIRTH_INFO,
      chart: chartWithOrigins,
    })

    const { container } = render(createElement(ChartDisplay))

    fireEvent.click(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }))

    const originHeading = screen.getByRole('heading', {
      name: 'Palace-origin Four Transformations',
    })
    expect(originHeading).toBeTruthy()
    expect(originHeading.parentElement?.textContent).toContain(
      'star-to-palace map. This is structural navigation only; it does not judge direction or outcome.',
    )
    expect(container.querySelectorAll(
      '[data-palace-origin-transformation]',
    )).toHaveLength(4)
    expect(container.querySelector(
      '[data-palace-origin-transformation="禄"]',
    )?.textContent).toContain('Ju Men')
    expect(container.querySelector(
      '[data-palace-origin-transformation="禄"]',
    )?.textContent).toContain('Children Palace')
    expect(container.querySelector(
      '[data-palace-origin-transformation="权"]',
    )?.textContent).toContain('Tai Yang')
    expect(container.querySelector(
      '[data-palace-origin-transformation="权"]',
    )?.textContent).toContain('Career Palace')
    expect(container.querySelector(
      '[data-palace-origin-transformation="科"]',
    )?.textContent).toContain('Wen Qu')
    expect(container.querySelector(
      '[data-palace-origin-transformation="科"]',
    )?.textContent).toContain('Fortune Palace')
    expect(container.querySelector(
      '[data-palace-origin-transformation="忌"]',
    )?.textContent).toContain('Wen Chang')
    expect(container.querySelector(
      '[data-palace-origin-transformation="忌"]',
    )?.textContent).toContain('Travel Palace')

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Lu destination in Children Palace',
    }))

    expect(screen.getByRole('heading', {
      name: 'About the Children Palace',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Explain Children Palace',
    }).getAttribute('data-palace-relation')).toBe('focus')
  })

  it('renders palace-origin destinations from a real iztro chart', () => {
    const realChart = generateChart({
      ...BIRTH_INFO,
      trueSolarEnabled: false,
    })
    useChartStore.setState({
      birthInfo: BIRTH_INFO,
      chart: realChart,
    })

    const { container } = render(createElement(ChartDisplay))
    fireEvent.click(screen.getByRole('button', {
      name: 'Explain Life Palace',
    }))

    expect(screen.getByRole('button', {
      name: 'Open Lu destination in Spouse Palace',
    })).toBeTruthy()
    expect(container.querySelector(
      '[data-palace-origin-transformation="禄"]',
    )?.textContent).toContain('Ju Men')
    expect(screen.getByRole('button', {
      name: 'Open Quan destination in Career Palace',
    })).toBeTruthy()
    expect(container.querySelector(
      '[data-palace-origin-transformation="权"]',
    )?.textContent).toContain('Tai Yang')
    expect(screen.getByRole('button', {
      name: 'Open Ke destination in Property Palace',
    })).toBeTruthy()
    expect(container.querySelector(
      '[data-palace-origin-transformation="科"]',
    )?.textContent).toContain('Wen Qu')
    expect(screen.getByRole('button', {
      name: 'Open Ji destination in Children Palace',
    })).toBeTruthy()
    expect(container.querySelector(
      '[data-palace-origin-transformation="忌"]',
    )?.textContent).toContain('Wen Chang')
  })

  it('indexes all four natal transformations and opens their owner palace', () => {
    const sharedOwnerChart = {
      ...CHART,
      palaces: CHART.palaces.map((palace, index) => {
        if (index === 3) {
          return {
            ...palace,
            majorStars: [
              ...palace.majorStars,
              ...CHART.palaces[4].majorStars,
            ],
          }
        }
        if (index === 4) {
          return { ...palace, majorStars: [] }
        }
        return palace
      }),
    } as FunctionalAstrolabe
    useChartStore.setState({
      birthInfo: BIRTH_INFO,
      chart: sharedOwnerChart,
    })

    render(createElement(ChartDisplay))

    expect(screen.getByRole('heading', {
      name: 'Natal Four Transformations',
    })).toBeTruthy()
    expect(screen.getByText(
      /none is a standalone verdict/,
    )).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Open Lu transformation in Travel Palace',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Open Quan transformation in Career Palace',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Open Ke transformation in Life Palace',
    })).toBeTruthy()

    const obstacleButton = screen.getByRole('button', {
      name: 'Open Ji transformation in Travel Palace',
    })
    expect(obstacleButton.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(obstacleButton)

    expect(obstacleButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', {
      name: 'Open Lu transformation in Travel Palace',
    }).getAttribute('aria-pressed')).toBe('false')
    expect(obstacleButton.getAttribute('aria-controls')).toBe(
      'selected-palace-explanation',
    )
    expect(screen.getByRole('heading', {
      name: 'About the Travel Palace',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Explain Travel Palace',
    }).getAttribute('data-palace-relation')).toBe('focus')
  })

  it('opens timing-layer palace context and clears it when the year changes', () => {
    render(createElement(ChartDisplay))

    const modelYear = Math.min(
      BIRTH_INFO.year + 99,
      Math.max(BIRTH_INFO.year, new Date().getFullYear()),
    )
    fireEvent.click(screen.getByRole('button', {
      name: `Open Annual ${modelYear} Ji transformation on Tian Ji in Travel Palace`,
    }))

    expect(screen.getByRole('heading', {
      name: 'About the Travel Palace',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Explain Travel Palace',
    }).getAttribute('data-palace-relation')).toBe('focus')

    fireEvent.change(screen.getByRole('combobox', {
      name: 'Timing lens year',
    }), {
      target: { value: String(modelYear + 1) },
    })

    expect(screen.queryByRole('heading', {
      name: 'About the Travel Palace',
    })).toBeNull()
    expect(screen.getByRole('button', {
      name: 'Explain Travel Palace',
    }).getAttribute('data-palace-relation')).toBeNull()
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

  it('labels a completely unknown hour as a placeholder', () => {
    useChartStore.setState({
      birthInfo: {
        ...BIRTH_INFO,
        trueSolarEnabled: false,
        birthTimeReliable: false,
        birthTimeUnknown: true,
      },
      chart: CHART,
    })

    render(createElement(ChartDisplay))

    expect(screen.getByRole('heading', {
      name: 'Birth hour not set',
    })).toBeTruthy()
    expect(screen.queryByRole('button', {
      name: 'Explain Life Palace',
    })).toBeNull()
    expect(screen.getByRole('heading', {
      name: 'Start With All 13 Time Blocks',
    })).toBeTruthy()
  })
})
