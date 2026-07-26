import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import { adaptAovQizheng, buildQizhengEvidence } from './qizheng-adapter'
import { QIZHENG_AOV_V1_FIXTURE } from './__fixtures__/qizheng-aov-v1'
import { calculateLocalQizheng } from './qizheng-local'

const BIRTH: BirthInfo = { year: 1990, month: 1, day: 1, hour: 12, gender: 'male', birthTimeReliable: true, resolvedBirthTime: { year: 1990, month: 1, day: 1, hour: 12, minute: 0, timeIndex: 6, originalShichen: '午时', correctedShichen: '午时', correctionMinutes: 0, applied: true, crossedDate: false, timezoneOffsetMinutes: 480, location: { name: '北京市', enName: 'Beijing', longitude: 116.4074, latitude: 39.9042, tz: 'Asia/Shanghai' } } }

describe('local Qizheng provider', () => {
  it('matches the anonymous fixture structure and modern-body positions', () => {
    const local = calculateLocalQizheng(BIRTH)
    const fixture = adaptAovQizheng(QIZHENG_AOV_V1_FIXTURE, buildQizhengEvidence(BIRTH)!)
    expect(local.ok).toBe(true)
    expect(fixture.ok).toBe(true)
    if (!local.ok || !fixture.ok) return

    expect(local.facts.stars.map((star) => star.name)).toEqual(fixture.facts.stars.map((star) => star.name))
    expect(local.facts.stars).toHaveLength(11)
    expect(local.facts.palaces).toHaveLength(12)
    expect(local.facts.aspects.length).toBeGreaterThan(0)
    expect(local.facts.lifePalace).toBe(fixture.facts.lifePalace)
    expect(local.facts.bodyPalace).toBe(fixture.facts.bodyPalace)
    for (let index = 0; index < 7; index += 1) {
      expect(local.facts.stars[index].longitude).toBeCloseTo(fixture.facts.stars[index].longitude, 1)
      expect(local.facts.stars[index].mansion).toBe(fixture.facts.stars[index].mansion)
    }
    expect(local.facts.stars[7]).toMatchObject({ sourceId: 'meeus-mean-lunar-node', precisionClass: '现代月轨近似' })
    expect(local.facts.stars[9]).toMatchObject({ sourceId: 'meeus-mean-lunar-apogee', precisionClass: '现代月轨近似' })
    expect(local.facts.stars.at(-1)).toMatchObject({ sourceId: 'qizhengsuan-ziqi', precisionClass: '传统均速模型' })
    expect(local.metadata).toMatchObject({ provider: 'cinnabar-local', source: 'local' })
  })

  it('derives Life and Body Palaces from the chart rules, not fixture constants', () => {
    const result = calculateLocalQizheng({ ...BIRTH, hour: 0, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, hour: 0, timeIndex: 0 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facts.lifePalace).not.toBe(6)
    expect(result.facts.bodyPalace).not.toBe(7)
    expect(result.facts.lifeMaster).toBe(['土', '土', '木', '火', '金', '水', '日', '月', '水', '金', '火', '木'][result.facts.lifePalace])
  })

  it('uses DST-aware resolved evidence without recalculating the location', () => {
    const result = calculateLocalQizheng({ ...BIRTH, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, timezoneOffsetMinutes: -240, location: { name: 'New York', longitude: -74.006, latitude: 40.7128, tz: 'America/New_York' } } })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.facts.evidence).toMatchObject({ timezoneId: 'America/New_York', timezoneOffsetHours: -4, longitude: -74.006, latitude: 40.7128 })
  })

  it('fails closed for unknown and approximate birth times', () => {
    expect(calculateLocalQizheng({ ...BIRTH, birthTimeUnknown: true })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
    expect(calculateLocalQizheng({ ...BIRTH, birthTimeReliable: false })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
  })
})
