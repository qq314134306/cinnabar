import { describe, expect, it } from 'vitest'
import { buildFutureReportPrompt, forecastYears } from './ai-prompts'

describe('forecastYears', () => {
  it('spans 2 years for the 1-year tier (this year + next)', () => {
    expect(forecastYears('1-year', 2026)).toEqual([2026, 2027])
  })

  it('spans 5 years for the 5-year tier', () => {
    expect(forecastYears('5-year', 2026)).toEqual([2026, 2027, 2028, 2029, 2030])
  })
})

describe('buildFutureReportPrompt', () => {
  it('scopes the 1-year prompt to this year and next year only', () => {
    const prompt = buildFutureReportPrompt('CHART FACTS HERE', 'YEARLY FACTS HERE', '1-year')
    expect(prompt).toContain('this year and next year (2 years)')
    expect(prompt).not.toContain('next four years')
  })

  it('scopes the 5-year prompt to the full five years', () => {
    const prompt = buildFutureReportPrompt('CHART FACTS HERE', 'YEARLY FACTS HERE', '5-year')
    expect(prompt).toContain('this year and the next four years (5 years)')
  })

  it('embeds both chart facts and yearly facts blocks', () => {
    const prompt = buildFutureReportPrompt('CHART-FACTS-MARKER', 'YEARLY-FACTS-MARKER', '5-year')
    expect(prompt).toContain('CHART-FACTS-MARKER')
    expect(prompt).toContain('YEARLY-FACTS-MARKER')
  })
})
