import { describe, expect, it } from 'vitest'
import { getShichenOptions, hourToShichen } from './shichen'

describe('shichen helpers', () => {
  it('keeps the twelve traditional two-hour options in display order', () => {
    const options = getShichenOptions()

    expect(options).toHaveLength(12)
    expect(options[0]).toEqual({
      value: 23,
      label: '23:00–00:59 (Rat Hour)',
    })
    expect(options[6]).toEqual({
      value: 12,
      label: '11:00–12:59 (Horse Hour)',
    })
    expect(options[11]).toEqual({
      value: 22,
      label: '21:00–22:59 (Pig Hour)',
    })
  })

  it('maps clock hours across the midnight Rat Hour boundary', () => {
    expect(hourToShichen(23)).toBe('Rat Hour')
    expect(hourToShichen(0)).toBe('Rat Hour')
    expect(hourToShichen(1)).toBe('Ox Hour')
    expect(hourToShichen(12)).toBe('Horse Hour')
    expect(hourToShichen(22)).toBe('Pig Hour')
  })
})
