import { describe, expect, it } from 'vitest'
import { astro } from 'iztro'
import { buildYearlyChartFacts, buildZiWeiChartFacts } from './chart-facts'
import type { BirthInfo } from './astro'

astro.config({
  yearDivide: 'normal',
  horoscopeDivide: 'normal',
  ageDivide: 'normal',
  dayDivide: 'forward',
  algorithm: 'zhongzhou',
})

const birthInfo: BirthInfo = {
  year: 2000,
  month: 8,
  day: 16,
  hour: 2,
  gender: 'male',
}

const CJK = /[一-鿿]/

describe('buildZiWeiChartFacts', () => {
  it('produces an English natal chart facts block with no CJK remnants', () => {
    const chart = astro.bySolar('2000-8-16', 2, '男', true)
    const facts = buildZiWeiChartFacts(chart, birthInfo)

    expect(facts).toContain('System: Zi Wei Dou Shu')
    expect(facts).toContain('Life Palace')
    expect(CJK.test(facts)).toBe(false)
  })
})

describe('buildYearlyChartFacts', () => {
  it('produces one grounded line per requested year with no CJK remnants', () => {
    const chart = astro.bySolar('2000-8-16', 2, '男', true)
    const years = [2026, 2027]
    const facts = buildYearlyChartFacts(chart, birthInfo, years)

    for (const year of years) {
      expect(facts).toContain(`${year} (age ${year - birthInfo.year + 1}`)
    }
    expect(facts).toMatch(/Lu on|Quan on|Ke on|Ji on/)
    expect(CJK.test(facts)).toBe(false)
  })
})
