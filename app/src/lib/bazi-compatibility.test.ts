import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import {
  buildBaziCompatibility,
  getBaziDayBranchRelation,
} from './bazi-compatibility'

function birthInfo(
  year: number,
  month: number,
  day: number,
  hour: number,
): BirthInfo {
  return {
    year,
    month,
    day,
    hour,
    gender: 'male',
    birthTimeReliable: true,
    resolvedBirthTime: {
      year,
      month,
      day,
      hour,
      minute: 0,
      timeIndex: Math.floor((hour + 1) / 2) % 12,
      originalShichen: '午时',
      correctedShichen: '午时',
      correctionMinutes: 0,
      applied: false,
      crossedDate: false,
      location: null,
    },
  }
}

describe('getBaziDayBranchRelation', () => {
  it('recognizes same, Six Harmony, Six Clash, and unclassified pairs', () => {
    expect(getBaziDayBranchRelation('子', '子').kind).toBe('same')
    expect(getBaziDayBranchRelation('子', '丑').kind).toBe('sixHarmony')
    expect(getBaziDayBranchRelation('丑', '子').kind).toBe('sixHarmony')
    expect(getBaziDayBranchRelation('子', '午').kind).toBe('sixClash')
    expect(getBaziDayBranchRelation('午', '子').kind).toBe('sixClash')
    expect(getBaziDayBranchRelation('子', '寅').kind).toBe('unclassified')
  })
})

describe('buildBaziCompatibility', () => {
  it('builds directional Day Master relationships from resolved inputs', () => {
    const result = buildBaziCompatibility(
      birthInfo(1990, 1, 1, 12),
      birthInfo(1992, 6, 15, 14),
    )

    expect(result).not.toBeNull()
    expect(result?.personA.dayPillar.ganZhi).toHaveLength(2)
    expect(result?.personB.dayPillar.ganZhi).toHaveLength(2)
    expect(result?.personA.pillars.map((pillar) => pillar.scope)).toEqual([
      'year',
      'month',
      'day',
      'hour',
    ])
    expect(result?.personB.pillars).toHaveLength(4)
    expect(result?.personA.pillars.every((pillar) => pillar.ganZhi.length === 2)).toBe(true)
    expect(result?.personAToB.label).toBeTruthy()
    expect(result?.personBToA.label).toBeTruthy()
    expect(result?.provisional).toBe(false)
  })

  it('does not fabricate a result without both resolved birth times', () => {
    const unresolved = birthInfo(1990, 1, 1, 12)
    delete unresolved.resolvedBirthTime

    expect(buildBaziCompatibility(
      unresolved,
      birthInfo(1992, 6, 15, 14),
    )).toBeNull()
  })

  it('marks the structure provisional when either entered time is approximate', () => {
    const approximate = birthInfo(1990, 1, 1, 12)
    approximate.birthTimeReliable = false

    expect(buildBaziCompatibility(
      approximate,
      birthInfo(1992, 6, 15, 14),
    )?.provisional).toBe(true)
  })
})
