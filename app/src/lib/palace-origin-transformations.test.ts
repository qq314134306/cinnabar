import { describe, expect, it } from 'vitest'
import { generateChart } from './astro'
import {
  buildPalaceOriginTransformations,
  collectPalaceOriginTransformations,
} from './palace-origin-transformations'

const SOURCE = {
  name: '命宫',
  heavenlyStem: '辛',
  earthlyBranch: '未',
}

describe('palace-origin Four Transformations', () => {
  it('keeps canonical Lu, Quan, Ke, Ji order and engine-owned destinations', () => {
    expect(buildPalaceOriginTransformations(SOURCE, [
      { name: '夫妻', earthlyBranch: '巳' },
      { name: '官禄', earthlyBranch: '亥' },
      { name: '田宅', earthlyBranch: '戌' },
      { name: '子女', earthlyBranch: '辰' },
    ])).toEqual([
      expect.objectContaining({
        code: '禄',
        targetPalaceName: '夫妻',
        targetPalaceBranch: '巳',
      }),
      expect.objectContaining({
        code: '权',
        targetPalaceName: '官禄',
        targetPalaceBranch: '亥',
      }),
      expect.objectContaining({
        code: '科',
        targetPalaceName: '田宅',
        targetPalaceBranch: '戌',
      }),
      expect.objectContaining({
        code: '忌',
        targetPalaceName: '子女',
        targetPalaceBranch: '辰',
      }),
    ])
  })

  it('marks a transformation that remains in the source palace', () => {
    const result = buildPalaceOriginTransformations(SOURCE, [
      { name: '命宫', earthlyBranch: '未' },
    ])

    expect(result[0].isSamePalace).toBe(true)
    expect(result.slice(1).every((item) => !item.isSamePalace)).toBe(true)
  })

  it('keeps all four slots explicit when the engine cannot resolve a host', () => {
    const result = buildPalaceOriginTransformations(SOURCE, [
      { name: '夫妻', earthlyBranch: '巳' },
    ])

    expect(result).toHaveLength(4)
    expect(result[1]).toMatchObject({
      code: '权',
      targetPalaceName: null,
      targetPalaceBranch: null,
    })
  })

  it('returns no invented map when the engine method is absent or fails', () => {
    expect(collectPalaceOriginTransformations(SOURCE)).toEqual([])
    expect(collectPalaceOriginTransformations({
      ...SOURCE,
      mutagedPlaces: () => {
        throw new Error('engine unavailable')
      },
    })).toEqual([])
  })

  it('reads the destinations from a real iztro FunctionalPalace', () => {
    const chart = generateChart({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      gender: 'male',
      trueSolarEnabled: false,
    })
    const lifePalace = chart.palace('命宫')

    expect(collectPalaceOriginTransformations(lifePalace)).toEqual([
      expect.objectContaining({
        code: '禄',
        targetPalaceName: '夫妻',
        targetPalaceBranch: '巳',
      }),
      expect.objectContaining({
        code: '权',
        targetPalaceName: '官禄',
        targetPalaceBranch: '亥',
      }),
      expect.objectContaining({
        code: '科',
        targetPalaceName: '田宅',
        targetPalaceBranch: '戌',
      }),
      expect.objectContaining({
        code: '忌',
        targetPalaceName: '子女',
        targetPalaceBranch: '辰',
      }),
    ])
  })
})
