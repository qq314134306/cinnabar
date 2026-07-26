import { describe, expect, it } from 'vitest'
import { QUESTION_GOLDEN_EVENT } from './question-divination.fixtures'
import { calculateQuestionCharts, createQuestionEvent, createUnavailableQuestionResults, zonedLocalDateTimeToUtc } from './question-divination'

describe('question divination foundation', () => {
  it('creates one immutable event with location evidence', () => {
    const event = createQuestionEvent({ question: '  Proceed? ', capturedAt: '2026-07-26T12:00:00Z', timezone: 'Asia/Shanghai', locationLabel: 'Anonymous' })
    expect(event.question).toBe('Proceed?')
    expect(event.location.capturedAt).toBe(event.capturedAt)
    expect(Object.isFrozen(event)).toBe(true)
    expect(Object.isFrozen(event.location)).toBe(true)
  })

  it('fails closed before calculating an invalid event', () => {
    expect(() => createQuestionEvent({ question: '', capturedAt: 'invalid', timezone: 'Mars/Olympus', locationLabel: '' })).toThrow()
  })

  it('converts a local IANA wall-clock time to the correct UTC instant across dates', () => {
    expect(zonedLocalDateTimeToUtc('2026-07-26T20:00', 'Asia/Shanghai')).toBe('2026-07-26T12:00:00.000Z')
    expect(zonedLocalDateTimeToUtc('2026-07-26T20:00', 'America/Los_Angeles')).toBe('2026-07-27T03:00:00.000Z')
  })

  it('rejects DST gaps and folds instead of guessing an instant', () => {
    expect(() => zonedLocalDateTimeToUtc('2026-03-08T02:30', 'America/Los_Angeles')).toThrow(/does not exist/i)
    expect(() => zonedLocalDateTimeToUtc('2026-11-01T01:30', 'America/Los_Angeles')).toThrow(/ambiguous/i)
  })

  it('returns versioned fail-closed results without facts while engines are unavailable', () => {
    const bundle = createUnavailableQuestionResults(QUESTION_GOLDEN_EVENT)
    expect(bundle.results.map((result) => result.metadata.contractVersion)).toEqual(['liuyao.facts.v1', 'qimen.facts.v1', 'liuren.facts.v1'])
    expect(bundle.results.every((result) => result.metadata.status === 'failed')).toBe(true)
    expect(bundle.results.every((result) => result.metadata.failure?.code === 'ENGINE_UNAVAILABLE')).toBe(true)
    expect(bundle.results.every((result) => result.facts === undefined)).toBe(true)
  })

  it('casts three independent versioned contracts from the exact same event', () => {
    const bundle = calculateQuestionCharts(QUESTION_GOLDEN_EVENT)
    expect(bundle.results.map((result) => result.method)).toEqual(['liuyao', 'qimen', 'liuren'])
    expect(bundle.results.every((result) => result.event === QUESTION_GOLDEN_EVENT)).toBe(true)
    expect(bundle.results.map((result) => result.metadata.contractVersion)).toEqual(['liuyao.facts.v1', 'qimen.facts.v1', 'liuren.facts.v1'])
    expect(bundle.results.every((result) => result.metadata.status === 'ok')).toBe(true)
    expect(bundle.results.every((result) => result.entitlement.tier === 'free')).toBe(true)
    expect(bundle.results.every((result) => result.entitlement.product === 'question-structural-facts')).toBe(true)
    expect(JSON.stringify(bundle)).not.toMatch(/prompt|deepseek|score|birth/i)
  })

  it('pins the anonymous offline golden fixture', () => {
    const bundle = calculateQuestionCharts(QUESTION_GOLDEN_EVENT)
    expect(bundle.results.map((result) => result.facts)).toMatchSnapshot()
  })
})
