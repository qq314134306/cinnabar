import { describe, expect, it } from 'vitest'
import type { BirthInfo } from './astro'
import { adaptAovQizheng, buildQizhengEvidence } from './qizheng-adapter'
import { QIZHENG_AOV_V1_FIXTURE } from './__fixtures__/qizheng-aov-v1'
import { calculateLocalQizheng, longitudeToQizhengMansion, QIZHENG_MANSION_BOUNDARIES } from './qizheng-local'

const BIRTH: BirthInfo = { year: 1990, month: 1, day: 1, hour: 12, gender: 'male', birthTimeReliable: true, resolvedBirthTime: { year: 1990, month: 1, day: 1, hour: 12, minute: 0, timeIndex: 6, originalShichen: '午时', correctedShichen: '午时', correctionMinutes: 0, applied: true, crossedDate: false, timezoneOffsetMinutes: 480, location: { name: '北京市', enName: 'Beijing', longitude: 116.4074, latitude: 39.9042, tz: 'Asia/Shanghai' } } }

describe('local Qizheng provider', () => {
  it('independently checks modern ephemeris positions while treating traditional rules as same-source parity', () => {
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
    expect(local.facts.aspects.filter((aspect) => /罗睺|计都|月孛/.test(`${aspect.star1}${aspect.star2}`))).not.toContainEqual(expect.objectContaining({ precisionClass: '同层现代天文' }))
  })

  it('assigns every unequal mansion boundary deterministically, including wraparound', () => {
    const names = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危', '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸']
    const distances = [12, 9, 16, 5, 6, 18, 9.5, 26, 8, 12, 10, 17, 16, 9, 16, 12, 15, 11, 16, 2, 9, 33, 4, 15, 7, 18, 18, 17]
    expect(distances.reduce((sum, value) => sum + value, 0)).toBe(366.5)
    expect(QIZHENG_MANSION_BOUNDARIES).toHaveLength(28)
    const epsilon = 1e-7
    QIZHENG_MANSION_BOUNDARIES.forEach((boundary, index) => {
      expect(longitudeToQizhengMansion(boundary).name).toBe(names[index])
      expect(longitudeToQizhengMansion(boundary).degree).toBeCloseTo(0, 8)
      expect(longitudeToQizhengMansion(boundary + epsilon).name).toBe(names[index])
      expect(longitudeToQizhengMansion(boundary - epsilon).name).toBe(names[(index + names.length - 1) % names.length])
    })
    expect(longitudeToQizhengMansion(0).name).toBe('角')
    expect(longitudeToQizhengMansion(360).name).toBe('角')
    expect(longitudeToQizhengMansion(-epsilon).name).toBe('轸')
    expect(longitudeToQizhengMansion(360 + epsilon).name).toBe('角')
  })

  it('derives Life and Body Palaces from the chart rules, not fixture constants', () => {
    const result = calculateLocalQizheng({ ...BIRTH, hour: 0, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, hour: 0, timeIndex: 0 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facts.lifePalace).not.toBe(6)
    expect(result.facts.bodyPalace).not.toBe(7)
    expect(result.facts.lifeMaster).toBe(['土', '土', '木', '火', '金', '水', '日', '月', '水', '金', '火', '木'][result.facts.lifePalace])
  })

  it('uses resolved timezone evidence without recalculating the location', () => {
    const result = calculateLocalQizheng({ ...BIRTH, resolvedBirthTime: { ...BIRTH.resolvedBirthTime!, timezoneOffsetMinutes: -300, location: { name: 'New York', longitude: -74.006, latitude: 40.7128, tz: 'America/New_York' } } })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.facts.evidence).toMatchObject({ timezoneId: 'America/New_York', timezoneOffsetHours: -5, longitude: -74.006, latitude: 40.7128 })
  })

  it('fails closed for unknown and approximate birth times', () => {
    expect(calculateLocalQizheng({ ...BIRTH, birthTimeUnknown: true })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
    expect(calculateLocalQizheng({ ...BIRTH, birthTimeReliable: false })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
    expect(calculateLocalQizheng({ ...BIRTH, birthTimeReliable: undefined })).toMatchObject({ ok: false, failure: { code: 'unreliable_birth_time' } })
  })
})
