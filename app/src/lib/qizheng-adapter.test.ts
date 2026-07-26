import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import { adaptAovQizheng, buildQizhengEvidence, qizhengPreflight } from './qizheng-adapter'
import { QIZHENG_AOV_V1_FIXTURE } from './__fixtures__/qizheng-aov-v1'

const BIRTH: BirthInfo = { year: 1990, month: 1, day: 1, hour: 12, gender: 'male', birthTimeReliable: true, resolvedBirthTime: { year: 1990, month: 1, day: 1, hour: 12, minute: 0, timeIndex: 6, originalShichen: '午时', correctedShichen: '午时', correctionMinutes: 0, applied: true, crossedDate: false, timezoneOffsetMinutes: 480, location: { name: '北京', enName: 'Beijing', longitude: 116.4074, latitude: 39.9042, tz: 'Asia/Shanghai' } } }

describe('Qizheng fact adapter', () => {
  it('adapts the fixed anonymous AOV fixture into qizheng.fact.v1', () => {
    const evidence = buildQizhengEvidence(BIRTH)!
    const result = adaptAovQizheng(QIZHENG_AOV_V1_FIXTURE, evidence, 'fixture')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facts.version).toBe('qizheng.fact.v1')
    expect(result.facts.stars).toHaveLength(11)
    expect(result.facts.palaces).toHaveLength(12)
    expect(result.facts.stars.at(-1)).toMatchObject({ name: '紫炁(木余)', precisionClass: '传统均速模型' })
    expect(result.metadata).toMatchObject({ provider: 'aov.cc', providerVersion: 'v1', adapterVersion: 'qizheng-aov.v1', source: 'fixture' })
  })

  it('fails closed on malformed provider data', () => {
    const result = adaptAovQizheng({ ok: true, data: { stars: [] } }, buildQizhengEvidence(BIRTH)!)
    expect(result).toMatchObject({ ok: false, failure: { code: 'invalid_provider_contract' } })
  })

  it('requires explicitly reliable time and fails closed for every other state', () => {
    expect(qizhengPreflight({ ...BIRTH, birthTimeReliable: false })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
    expect(qizhengPreflight({ ...BIRTH, birthTimeReliable: undefined })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
    expect(qizhengPreflight({ ...BIRTH, birthTimeUnknown: true })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
  })

  it('requires unified resolved coordinate and timezone evidence', () => {
    expect(qizhengPreflight({ ...BIRTH, resolvedBirthTime: undefined })).toMatchObject({ ok: false, failure: { code: 'missing_resolved_evidence' } })
    expect(buildQizhengEvidence({ ...BIRTH, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, location: { ...BIRTH.resolvedBirthTime!.location!, tz: undefined } } })).toBeNull()
    for (const [field, value] of [['latitude', Infinity], ['latitude', 91], ['longitude', Number.NaN], ['longitude', -181]] as const) {
      expect(buildQizhengEvidence({ ...BIRTH, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, location: { ...BIRTH.resolvedBirthTime!.location!, [field]: value } } })).toBeNull()
    }
    expect(buildQizhengEvidence({ ...BIRTH, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, timezoneOffsetMinutes: 841 } })).toBeNull()
  })

  it('pins the UTC instant to the supplied IANA timezone and historical DST offset', () => {
    const summer = { ...BIRTH, year: 2024, month: 7, day: 1, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, year: 2024, month: 7, day: 1, timezoneOffsetMinutes: -240, location: { name: 'New York', longitude: -74.006, latitude: 40.7128, tz: 'America/New_York' } } }
    expect(buildQizhengEvidence(summer)).toMatchObject({ resolvedLocalTime: '2024-07-01T12:00:00', resolvedUtcTime: '2024-07-01T16:00:00.000Z', timezoneOffsetHours: -4 })
    expect(buildQizhengEvidence({ ...summer, resolvedBirthTime: { ...summer.resolvedBirthTime, timezoneOffsetMinutes: -300 } })).toBeNull()
  })
})
