import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import { buildZiweiCompatibility } from './ziwei-compatibility'

const anonymousA: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
  birthTimeReliable: true,
  resolvedBirthTime: {
    year: 1990, month: 1, day: 1, hour: 12, minute: 0,
    timeIndex: 6, originalShichen: '午时', correctedShichen: '午时',
    correctionMinutes: 0, applied: false, crossedDate: false, location: null,
  },
}

const anonymousB: BirthInfo = {
  year: 1992,
  month: 6,
  day: 15,
  hour: 14,
  gender: 'female',
  birthTimeReliable: true,
  resolvedBirthTime: {
    year: 1992, month: 6, day: 15, hour: 14, minute: 0,
    timeIndex: 7, originalShichen: '未时', correctedShichen: '未时',
    correctionMinutes: 0, applied: false, crossedDate: false, location: null,
  },
}

describe('buildZiweiCompatibility anonymous golden pair', () => {
  it('casts two charts and pins inspectable overlays, cross-transformations, and networks', () => {
    const result = buildZiweiCompatibility(anonymousA, anonymousB)

    expect(result.uncertainty).toEqual({ suppressed: false })
    expect(result.charts).toEqual([
      {
        label: 'Person A', solarDate: '1990-1-1', reliableTime: true,
        lifePalaceBranch: '未', lifePalaceStars: ['天梁'],
      },
      {
        label: 'Person B', solarDate: '1992-6-15', reliableTime: true,
        lifePalaceBranch: '亥', lifePalaceStars: ['天同'],
      },
    ])
    expect(result.palaceOverlays).toHaveLength(12)
    expect(result.palaceOverlays.slice(0, 3)).toEqual([
      { direction: 'A→B', sourcePalace: '命宫', branch: '未', receivingPalace: '财帛' },
      { direction: 'A→B', sourcePalace: '夫妻', branch: '巳', receivingPalace: '迁移' },
      { direction: 'A→B', sourcePalace: '福德', branch: '酉', receivingPalace: '夫妻' },
    ])
    expect(result.crossTransformations).toHaveLength(8)
    expect(result.crossTransformations.map(({ direction, code, starName, receivingPalace }) => ({
      direction, code, starName, receivingPalace,
    }))).toMatchInlineSnapshot(`
      [
        {
          "code": "禄",
          "direction": "A→B",
          "receivingPalace": "兄弟",
          "starName": "武曲",
        },
        {
          "code": "权",
          "direction": "A→B",
          "receivingPalace": "仆役",
          "starName": "贪狼",
        },
        {
          "code": "科",
          "direction": "A→B",
          "receivingPalace": "财帛",
          "starName": "天梁",
        },
        {
          "code": "忌",
          "direction": "A→B",
          "receivingPalace": "兄弟",
          "starName": "文曲",
        },
        {
          "code": "禄",
          "direction": "B→A",
          "receivingPalace": "夫妻",
          "starName": "天梁",
        },
        {
          "code": "权",
          "direction": "B→A",
          "receivingPalace": "子女",
          "starName": "紫微",
        },
        {
          "code": "科",
          "direction": "B→A",
          "receivingPalace": "父母",
          "starName": "左辅",
        },
        {
          "code": "忌",
          "direction": "B→A",
          "receivingPalace": "仆役",
          "starName": "武曲",
        },
      ]
    `)
    expect(result.sanFangInteractions).toHaveLength(4)
    expect(result.sanFangInteractions[0]).toEqual({
      direction: 'A→B', focusPalace: '命宫', focusBranch: '未',
      receivingPalaces: [
        { role: 'focus', branch: '未', palaceName: '财帛' },
        { role: 'trine', branch: '亥', palaceName: '命宫' },
        { role: 'opposite', branch: '丑', palaceName: '福德' },
        { role: 'trine', branch: '卯', palaceName: '官禄' },
      ],
    })
  })

  it('withholds every hour-dependent cross-chart conclusion when either time is approximate', () => {
    const result = buildZiweiCompatibility(
      { ...anonymousA, birthTimeReliable: false },
      anonymousB,
    )

    expect(result.uncertainty.suppressed).toBe(true)
    expect(result.charts[0]).not.toHaveProperty('lifePalaceBranch')
    expect(result.charts[0].lifePalaceStars).toEqual([])
    expect(result.palaceOverlays).toEqual([])
    expect(result.crossTransformations).toEqual([])
    expect(result.sanFangInteractions).toEqual([])
  })

  it('uses resolvedBirthTime without mutating either canonical input or BaZi facts', () => {
    const correctedA = structuredClone(anonymousA)
    correctedA.resolvedBirthTime = {
      ...correctedA.resolvedBirthTime!, year: 1989, month: 12, day: 31,
      crossedDate: true,
    }
    const before = structuredClone(correctedA)

    const result = buildZiweiCompatibility(correctedA, anonymousB)

    expect(result.charts[0].solarDate).toBe('1989-12-31')
    expect(correctedA).toEqual(before)
    expect(correctedA).not.toHaveProperty('pillars')
  })
})
