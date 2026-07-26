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

  it('refuses time-derived facts for approximate time', () => {
    expect(qizhengPreflight({ ...BIRTH, birthTimeReliable: false })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
  })

  it('requires unified resolved coordinate and timezone evidence', () => {
    expect(qizhengPreflight({ ...BIRTH, resolvedBirthTime: undefined })).toMatchObject({ ok: false, failure: { code: 'missing_resolved_evidence' } })
  })
})
