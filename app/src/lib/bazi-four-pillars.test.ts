import { describe, expect, it } from 'vitest'
import {
  buildBaziFourPillars,
  type BaziPillarScope,
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
})
