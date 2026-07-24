import { describe, expect, it, vi } from 'vitest'
import {
  buildTimingLens,
  type TimingLensChartInput,
} from './timing-lens'

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
    horoscope: vi.fn(() => ({
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
        mutagen: ['天梁', '紫微', '文昌', '不存在'],
      },
    })),
  }
}

describe('timing lens', () => {
  it('maps Major Limit and annual structure back to natal palaces', () => {
    const chart = createChart()
    const lens = buildTimingLens(chart, 1990, 2026)

    expect(lens).toMatchObject({
      year: 2026,
      age: 37,
      majorLimit: {
        ganZhi: '戊辰',
        range: [35, 44],
        lifePalaceHost: {
          name: '迁移',
          branch: '亥',
        },
      },
      annual: {
        ganZhi: '丙午',
        lifePalaceHost: {
          name: '命宫',
          branch: '巳',
        },
      },
    })
    expect(lens.majorLimit.transformations.map((item) => item.code)).toEqual(
      ['禄', '权', '科', '忌'],
    )
    expect(lens.majorLimit.transformations[2]).toMatchObject({
      code: '科',
      starName: '文昌',
      hostPalace: {
        name: '官禄',
        branch: '酉',
      },
    })
    expect(lens.annual.transformations[3]).toEqual({
      code: '忌',
      starName: '不存在',
      hostPalace: null,
    })

    const horoscope = vi.mocked(chart.horoscope)
    const requestedDate = horoscope.mock.calls[0][0]
    expect(requestedDate.getFullYear()).toBe(2026)
    expect(requestedDate.getMonth()).toBe(5)
    expect(requestedDate.getDate()).toBe(15)
  })

  it('keeps missing period values unavailable instead of inventing them', () => {
    const chart = createChart()
    chart.horoscope = () => ({
      decadal: {},
      yearly: {
        heavenlyStem: '丙',
        earthlyBranch: '午',
        palaceNames: ['父母'],
        mutagen: ['天梁'],
      },
    })

    const lens = buildTimingLens(chart, 1990, 1990)

    expect(lens.majorLimit.range).toBeNull()
    expect(lens.majorLimit.lifePalaceHost).toBeNull()
    expect(lens.majorLimit.transformations).toEqual([])
    expect(lens.annual.lifePalaceHost).toBeNull()
    expect(lens.annual.transformations).toHaveLength(1)
  })

  it('rejects non-integer or pre-birth model years', () => {
    const chart = createChart()

    expect(() => buildTimingLens(chart, 1990, 1989)).toThrow(RangeError)
    expect(() => buildTimingLens(chart, 1990, 2026.5)).toThrow(RangeError)
    expect(chart.horoscope).not.toHaveBeenCalled()
  })

  it('does not impose the browser 100-year browsing cap on shared facts', () => {
    const lens = buildTimingLens(createChart(), 1990, 2090)

    expect(lens.age).toBe(101)
    expect(lens.year).toBe(2090)
  })
})
