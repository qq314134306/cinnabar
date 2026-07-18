import { describe, expect, it } from 'vitest'
import { astro } from 'iztro'
import { deriveSoulCard, identityLine } from './soul-card'

astro.config({
  yearDivide: 'normal',
  horoscopeDivide: 'normal',
  ageDivide: 'normal',
  dayDivide: 'forward',
  algorithm: 'zhongzhou',
})

const CJK = /[一-鿿]/

describe('deriveSoulCard', () => {
  it('derives element accent, keywords, identity and teaser with no CJK leakage', () => {
    const chart = astro.bySolar('2000-8-16', 2, '男', true)
    const data = deriveSoulCard(chart)

    // Element resolves to a known English name + hex color.
    expect(['Water', 'Wood', 'Fire', 'Earth', 'Metal', 'Star']).toContain(data.element.name)
    expect(data.element.color).toMatch(/^#[0-9A-Fa-f]{6}$/)

    // Keywords: 2–3, all latin.
    expect(data.keywords.length).toBeGreaterThanOrEqual(2)
    expect(data.keywords.length).toBeLessThanOrEqual(3)
    for (const kw of data.keywords) expect(CJK.test(kw)).toBe(false)

    // Identity + teaser are English.
    expect(CJK.test(identityLine(data))).toBe(false)
    expect(data.hiddenStrength.length).toBeGreaterThan(10)
    expect(CJK.test(data.hiddenStrength)).toBe(false)
  })

  it('is deterministic — same chart yields the same card', () => {
    const a = deriveSoulCard(astro.bySolar('1995-3-10', 5, '女', true))
    const b = deriveSoulCard(astro.bySolar('1995-3-10', 5, '女', true))
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })
})
