import { describe, expect, it } from 'vitest'
import { buildBaziMajorLuck } from './bazi-major-luck'

describe('buildBaziMajorLuck', () => {
  it('builds minute-aware reverse cycles for a yang-year male', () => {
    const result = buildBaziMajorLuck({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      gender: 'male',
    })

    expect(result).toMatchObject({
      direction: 'reverse',
      startAt: '1998-05-04 20:00:00',
      startOffset: { years: 8, months: 4, days: 3, hours: 8 },
    })
    expect(result?.cycles).toHaveLength(8)
    expect(result?.cycles[0]).toEqual({
      ganZhi: '乙亥',
      startYear: 1998,
      endYear: 2007,
      startAge: 9,
      endAge: 18,
    })
  })

  it('uses the gender direction rule', () => {
    const result = buildBaziMajorLuck({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      gender: 'female',
    })

    expect(result?.direction).toBe('forward')
    expect(result?.cycles[0].ganZhi).toBe('丁丑')
  })

  it('rejects invalid corrected dates', () => {
    expect(buildBaziMajorLuck({
      year: 2025,
      month: 2,
      day: 30,
      hour: 12,
      minute: 0,
      gender: 'male',
    })).toBeNull()
  })
})
