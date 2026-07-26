import { describe, expect, it } from 'vitest'
import {
  BAZI_HIDDEN_STEMS,
  buildBaziFourPillars,
  type BaziPillarScope,
  getBaziTenGod,
} from './bazi-four-pillars'

describe('BaZi Four Pillars', () => {
  it('builds all four pillars and the Day Master in canonical order', () => {
    const result = buildBaziFourPillars({
      year: 1990,
      month: 1,
      day: 1,
      timeIndex: 6,
    })

    expect(result?.pillars.map((pillar) => ({
      scope: pillar.scope,
      ganZhi: pillar.ganZhi,
    }))).toEqual([
      { scope: 'year', ganZhi: '己巳' },
      { scope: 'month', ganZhi: '丙子' },
      { scope: 'day', ganZhi: '丙寅' },
      { scope: 'hour', ganZhi: '甲午' },
    ])
    expect(result?.dayMaster).toEqual({
      stem: '丙',
      element: 'Fire',
      polarity: 'Yang',
    })
    expect(result?.pillars.map((pillar) => ({
      scope: pillar.scope,
      visibleTenGod: pillar.visibleTenGod,
      hiddenStems: pillar.hiddenStems,
    }))).toEqual([
      {
        scope: 'year',
        visibleTenGod: 'hurtingOfficer',
        hiddenStems: [
          { stem: '丙', tenGod: 'peer' },
          { stem: '庚', tenGod: 'indirectWealth' },
          { stem: '戊', tenGod: 'eatingGod' },
        ],
      },
      {
        scope: 'month',
        visibleTenGod: 'peer',
        hiddenStems: [
          { stem: '癸', tenGod: 'directOfficer' },
        ],
      },
      {
        scope: 'day',
        visibleTenGod: 'dayMaster',
        hiddenStems: [
          { stem: '甲', tenGod: 'indirectResource' },
          { stem: '丙', tenGod: 'peer' },
          { stem: '戊', tenGod: 'eatingGod' },
        ],
      },
      {
        scope: 'hour',
        visibleTenGod: 'indirectResource',
        hiddenStems: [
          { stem: '丁', tenGod: 'robWealth' },
          { stem: '己', tenGod: 'hurtingOfficer' },
        ],
      },
    ])
  })

  it('uses the BaZi Li Chun boundary instead of the Zi Wei lunar-year boundary', () => {
    const result = buildBaziFourPillars({
      year: 1990,
      month: 2,
      day: 1,
      timeIndex: 6,
    })

    expect(result?.pillars[0]).toMatchObject({
      scope: 'year',
      ganZhi: '己巳',
    })
    expect(result?.pillars[1]).toMatchObject({
      scope: 'month',
      ganZhi: '丁丑',
    })
  })

  it.each([
    { year: 1990, month: 2, day: 30, timeIndex: 6 },
    { year: 1990, month: 1, day: 1, timeIndex: -1 },
    { year: 1990, month: 1, day: 1, timeIndex: 13 },
  ])('returns no fabricated pillars for invalid input %#', (input) => {
    expect(buildBaziFourPillars(input)).toBeNull()
  })

  it('keeps the exported scope type aligned with all four positions', () => {
    const scopes: BaziPillarScope[] = ['year', 'month', 'day', 'hour']
    expect(scopes).toHaveLength(4)
  })

  it('covers every Ten Gods relationship exactly once for each Day Master', () => {
    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']

    for (const dayStem of stems) {
      const relationships = stems.map((targetStem) => (
        getBaziTenGod(dayStem, targetStem)
      ))
      expect(relationships).not.toContain(null)
      expect(new Set(relationships).size).toBe(10)
      expect(getBaziTenGod(dayStem, dayStem)).toBe('peer')
    }
  })

  it('keeps the canonical hidden-stem order for all twelve branches', () => {
    expect(BAZI_HIDDEN_STEMS).toEqual({
      子: ['癸'],
      丑: ['己', '癸', '辛'],
      寅: ['甲', '丙', '戊'],
      卯: ['乙'],
      辰: ['戊', '乙', '癸'],
      巳: ['丙', '庚', '戊'],
      午: ['丁', '己'],
      未: ['己', '丁', '乙'],
      申: ['庚', '壬', '戊'],
      酉: ['辛'],
      戌: ['戊', '辛', '丁'],
      亥: ['壬', '甲'],
    })
  })

  it('returns no relationship for unknown stems', () => {
    expect(getBaziTenGod('甲', '?')).toBeNull()
    expect(getBaziTenGod('?', '甲')).toBeNull()
  })
})
