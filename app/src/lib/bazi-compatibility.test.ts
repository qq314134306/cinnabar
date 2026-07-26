import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import {
  buildBaziCompatibility,
  getBaziDayBranchRelation,
  getBaziStemContact,
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

describe('getBaziStemContact', () => {
  it('recognizes all five canonical combinations in either direction', () => {
    const pairs = [
      ['甲', '己'],
      ['乙', '庚'],
      ['丙', '辛'],
      ['丁', '壬'],
      ['戊', '癸'],
    ]

    for (const [first, second] of pairs) {
      expect(getBaziStemContact(first, second).kind).toBe('fiveCombination')
      expect(getBaziStemContact(second, first).kind).toBe('fiveCombination')
    }
    expect(getBaziStemContact('甲', '甲').kind).toBe('unclassified')
    expect(getBaziStemContact('甲', '乙').kind).toBe('unclassified')
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
    expect(result?.personA.pillars.every((pillar) => (
      pillar.hiddenStems.length >= 1 && pillar.hiddenStems.length <= 3
    ))).toBe(true)
    expect(result?.personAToB.label).toBeTruthy()
    expect(result?.personBToA.label).toBeTruthy()
    expect(result?.branchContacts.length).toBeGreaterThan(0)
    expect(result?.branchContacts.length).toBeLessThanOrEqual(16)
    expect(result?.branchContacts.every((contact) => (
      contact.kind === 'same'
      || contact.kind === 'sixHarmony'
      || contact.kind === 'sixClash'
    ))).toBe(true)
    expect(result?.branchContacts).toContainEqual(expect.objectContaining({
      personAScope: 'year',
      personBScope: 'year',
      kind: 'sixHarmony',
    }))
    expect(result?.stemContacts.length).toBeLessThanOrEqual(16)
    expect(result?.stemContacts.every((contact) => (
      getBaziStemContact(contact.personAStem, contact.personBStem).kind
        === 'fiveCombination'
    ))).toBe(true)
    expect(result?.stemRelationships.personAToB).toHaveLength(4)
    expect(result?.stemRelationships.personBToA).toHaveLength(4)
    expect(result?.stemRelationships.personAToB).toContainEqual({
      targetScope: 'year',
      targetStem: '壬',
      relationship: 'sevenKillings',
      label: 'Seven Killings',
    })
    expect(result?.stemRelationships.personBToA).toContainEqual({
      targetScope: 'year',
      targetStem: '己',
      relationship: 'directOfficer',
      label: 'Direct Officer',
    })
    expect(result?.hiddenStemRelationships.personAToB).toHaveLength(
      result?.personB.pillars.reduce(
        (total, pillar) => total + pillar.hiddenStems.length,
        0,
      ) ?? 0,
    )
    expect(result?.hiddenStemRelationships.personBToA).toHaveLength(
      result?.personA.pillars.reduce(
        (total, pillar) => total + pillar.hiddenStems.length,
        0,
      ) ?? 0,
    )
    expect(result?.hiddenStemRelationships.personAToB).toContainEqual({
      targetScope: 'year',
      targetBranch: '申',
      targetStem: '庚',
      hiddenStemIndex: 0,
      relationship: 'indirectWealth',
      label: 'Indirect Wealth',
    })
    expect(result?.hiddenStemRelationships.personAToB.every((relationship) => {
      const pillar = result.personB.pillars.find(
        (item) => item.scope === relationship.targetScope,
      )
      return Boolean(
        pillar
        && pillar.branch === relationship.targetBranch
        && pillar.hiddenStems[relationship.hiddenStemIndex]
          === relationship.targetStem,
      )
    })).toBe(true)
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
