import { describe, expect, it } from 'vitest'
import { generateChart, type BirthInfo } from './astro'
import {
  buildBirthTimeSensitivity,
  haveStructuralBirthTimeDifferences,
  type BirthTimeScenarioSummary,
} from './birth-time-sensitivity'
import { resolveBirthTime } from './true-solar-time'

function approximateBirthInfo(
  overrides: Partial<BirthInfo> = {},
): BirthInfo {
  const base: BirthInfo = {
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    gender: 'male',
    trueSolarEnabled: false,
    birthTimeReliable: false,
  }
  const info = { ...base, ...overrides }
  return {
    ...info,
    resolvedBirthTime: resolveBirthTime({
      year: info.year,
      month: info.month,
      day: info.day,
      hour: info.hour,
      enabled: false,
    }),
  }
}

function scenario(
  overrides: Partial<BirthTimeScenarioSummary>,
): BirthTimeScenarioSummary {
  return {
    position: 'selected',
    input: { year: 1990, month: 1, day: 1, hour: 12 },
    resolved: resolveBirthTime({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      enabled: false,
    }),
    lifePalace: { branch: '午', majorStars: ['天梁'] },
    bodyPalace: { branch: '申' },
    fiveElementsClass: '土五局',
    ...overrides,
  }
}

describe('birth-time sensitivity', () => {
  it('builds the previous, selected, and next local two-hour scenarios', () => {
    const birthInfo = approximateBirthInfo()
    const result = buildBirthTimeSensitivity(
      generateChart(birthInfo),
      birthInfo,
    )

    expect(result.scenarios.map((item) => item.position)).toEqual([
      'earlier',
      'selected',
      'later',
    ])
    expect(result.scenarios.map((item) => item.input.hour)).toEqual([
      10,
      12,
      14,
    ])
    expect(result.suppressedConclusions).toContain('Exact Hour Pillar')
    for (const item of result.scenarios) {
      expect(item.lifePalace?.branch).toBeTruthy()
      expect(item.bodyPalace?.branch).toBeTruthy()
      expect(item.fiveElementsClass).toBeTruthy()
    }
  })

  it('moves the later scenario into the next date after late Rat Hour', () => {
    const birthInfo = approximateBirthInfo({
      year: 1990,
      month: 12,
      day: 31,
      hour: 23,
    })
    const result = buildBirthTimeSensitivity(
      generateChart(birthInfo),
      birthInfo,
    )

    expect(result.scenarios[2].input).toEqual({
      year: 1991,
      month: 1,
      day: 1,
      hour: 1,
    })
  })

  it('moves the earlier scenario into the previous date after early Rat Hour', () => {
    const birthInfo = approximateBirthInfo({
      year: 1990,
      month: 1,
      day: 1,
      hour: 0,
    })
    const result = buildBirthTimeSensitivity(
      generateChart(birthInfo),
      birthInfo,
    )

    expect(result.scenarios[0].input).toEqual({
      year: 1989,
      month: 12,
      day: 31,
      hour: 22,
    })
  })

  it('recomputes true-solar correction for each neighboring wall time', () => {
    const location = {
      name: 'London',
      country: 'United Kingdom',
      longitude: -0.1276,
      tz: 'Europe/London',
      latinKeys: ['london'],
    }
    const base: BirthInfo = {
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      gender: 'male',
      birthplace: 'London',
      trueSolarEnabled: true,
      birthTimeReliable: false,
    }
    const birthInfo = {
      ...base,
      resolvedBirthTime: resolveBirthTime({
        year: base.year,
        month: base.month,
        day: base.day,
        hour: base.hour,
        birthplace: 'London',
        enabled: true,
        birthplaces: [location],
      }),
    }
    const result = buildBirthTimeSensitivity(
      generateChart(birthInfo),
      birthInfo,
    )
    const expectedEarlier = resolveBirthTime({
      year: 1990,
      month: 1,
      day: 1,
      hour: 10,
      birthplace: 'London',
      enabled: true,
      birthplaces: [location],
    })
    const expectedLater = resolveBirthTime({
      year: 1990,
      month: 1,
      day: 1,
      hour: 14,
      birthplace: 'London',
      enabled: true,
      birthplaces: [location],
    })

    expect(result.scenarios.every((item) => item.resolved.applied)).toBe(true)
    expect(result.scenarios[0].resolved).toMatchObject({
      ...expectedEarlier,
      evidence: expect.objectContaining({ uncertainty: 'approximate' }),
    })
    expect(result.scenarios[1].resolved).toBe(birthInfo.resolvedBirthTime)
    expect(result.scenarios[2].resolved).toMatchObject({
      ...expectedLater,
      evidence: expect.objectContaining({ uncertainty: 'approximate' }),
    })
  })

  it('distinguishes stable and changed structural summaries', () => {
    const stable = [
      scenario({ position: 'earlier' }),
      scenario({ position: 'selected' }),
      scenario({ position: 'later' }),
    ]
    const changed = [
      ...stable.slice(0, 2),
      scenario({
        position: 'later',
        lifePalace: { branch: '未', majorStars: ['紫微'] },
      }),
    ]

    expect(haveStructuralBirthTimeDifferences(stable)).toBe(false)
    expect(haveStructuralBirthTimeDifferences(changed)).toBe(true)
  })
})
