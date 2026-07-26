import { describe, expect, it } from 'vitest'
import { buildDailyTiming } from './daily-timing'

describe('buildDailyTiming', () => {
  it('compares a selected day stem with the natal Day Master', () => {
    const result = buildDailyTiming({
      birth: {
        year: 1990,
        month: 1,
        day: 1,
        timeIndex: 6,
      },
      selectedDate: {
        year: 2026,
        month: 7,
        day: 25,
      },
    })

    expect(result).not.toBeNull()
    expect(result?.dayPillar.ganZhi).toHaveLength(2)
    expect(result?.relationshipLabel).toBeTruthy()
    expect(result?.relationshipDescription).toContain('selected day')
  })

  it('returns null for an invalid selected date', () => {
    expect(buildDailyTiming({
      birth: {
        year: 1990,
        month: 1,
        day: 1,
        timeIndex: 6,
      },
      selectedDate: {
        year: 2026,
        month: 2,
        day: 30,
      },
    })).toBeNull()
  })
})
