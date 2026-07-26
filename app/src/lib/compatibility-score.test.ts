import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import { compareBirthCharts } from './compatibility-score'

const PERSON_A: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
}

const PERSON_B: BirthInfo = {
  year: 1992,
  month: 6,
  day: 15,
  hour: 14,
  gender: 'female',
}

describe('compareBirthCharts', () => {
  it('builds a bounded English compatibility snapshot without a network call', () => {
    const result = compareBirthCharts(PERSON_A, PERSON_B, 2026)

    expect(result.year).toBe(2026)
    expect(result.overall).toBeGreaterThanOrEqual(25)
    expect(result.overall).toBeLessThanOrEqual(98)
    expect(result.dimensions.map((dimension) => dimension.key)).toEqual([
      'communication',
      'sharedDirection',
      'emotionalRhythm',
      'resilience',
    ])
    for (const dimension of result.dimensions) {
      expect(dimension.score).toBeGreaterThanOrEqual(25)
      expect(dimension.score).toBeLessThanOrEqual(98)
      expect(dimension.summary).toContain(dimension.label)
    }
    expect(result.personA.identity).toMatch(/[A-Za-z]/)
    expect(result.personB.identity).toMatch(/[A-Za-z]/)
    expect(result.elementStory).toMatch(/[A-Za-z]/)
  })

  it('keeps scores symmetric when the two people are swapped', () => {
    const forward = compareBirthCharts(PERSON_A, PERSON_B, 2026)
    const reverse = compareBirthCharts(PERSON_B, PERSON_A, 2026)

    expect(reverse.overall).toBe(forward.overall)
    expect(reverse.dimensions.map((dimension) => dimension.score)).toEqual(
      forward.dimensions.map((dimension) => dimension.score),
    )
    expect(reverse.personA).toEqual(forward.personB)
    expect(reverse.personB).toEqual(forward.personA)
  })

  it('is deterministic for the same inputs and model year', () => {
    expect(compareBirthCharts(PERSON_A, PERSON_B, 2027)).toEqual(
      compareBirthCharts(PERSON_A, PERSON_B, 2027),
    )
  })
})
