import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoVector,
  SunPosition,
} from 'astronomy-engine'
import type { BirthInfo } from './astro'
import { qizhengPreflight } from './qizheng-adapter'
import {
  QIZHENG_FACT_VERSION,
  type QizhengAspectFact,
  type QizhengEvidence,
  type QizhengResult,
  type QizhengStarFact,
} from './qizheng-contract'

const MODERN_BODIES = [
  ['太阳', Body.Sun, 'astronomy-engine-sun'],
  ['太阴', Body.Moon, 'astronomy-engine-moon'],
  ['辰星(水)', Body.Mercury, 'astronomy-engine-mercury'],
  ['太白(金)', Body.Venus, 'astronomy-engine-venus'],
  ['荧惑(火)', Body.Mars, 'astronomy-engine-mars'],
  ['岁星(木)', Body.Jupiter, 'astronomy-engine-jupiter'],
  ['镇星(土)', Body.Saturn, 'astronomy-engine-saturn'],
] as const
const MANSIONS = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危', '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸']
// Mingyu's audited ancient-distance table totals 366.5 du; scale that complete
// table onto the project's 360-degree sidereal coordinate.
const MANSION_DISTANCES = [12, 9, 16, 5, 6, 18, 9.5, 26, 8, 12, 10, 17, 16, 9, 16, 12, 15, 11, 16, 2, 9, 33, 4, 15, 7, 18, 18, 17]
const MANSION_TOTAL = MANSION_DISTANCES.reduce((sum, distance) => sum + distance, 0)
export const QIZHENG_MANSION_BOUNDARIES = MANSION_DISTANCES.map((_, index) => MANSION_DISTANCES.slice(0, index).reduce((sum, distance) => sum + distance, 0) * 360 / MANSION_TOTAL)
const PALACES = ['命宫', '财帛', '兄弟', '田宅', '男女', '奴仆', '妻妾', '疾厄', '迁移', '官禄', '福德', '相貌']
const LIFE_MASTERS = ['土', '土', '木', '火', '金', '水', '日', '月', '水', '金', '火', '木']
const ASPECTS = [
  ['同宫', 0, 8], ['六合', 60, 4], ['四正', 90, 6], ['三方', 120, 6], ['对照', 180, 8],
] as const
const LOCAL_METADATA = { provider: 'cinnabar-local', providerVersion: 'astronomy-engine.2.1.19+qizheng-rules.v1', adapterVersion: 'qizheng-local.v1', source: 'local' } as const

export function calculateLocalQizheng(birth: BirthInfo): QizhengResult {
  const preflight = qizhengPreflight(birth)
  if ('ok' in preflight) return { ...preflight, metadata: LOCAL_METADATA }
  try {
    const date = utcDate(preflight)
    const longitudes = modernLongitudes(date)
    const hourIndex = shichenIndex(preflight.resolvedLocalTime)
    const sunSign = siderealSign(longitudes.get(Body.Sun)!, date)
    const moonSign = siderealSign(longitudes.get(Body.Moon)!, date)
    // 果老 rule: birth hour placed at the Sun, count forward to Mao for Life;
    // birth hour placed at the Moon, count backward to You for Body.
    const lifePalace = normalizeIndex(sunSign + 3 - hourIndex, 12)
    const bodyPalace = normalizeIndex(moonSign + hourIndex - 9, 12)
    const residues = residualLongitudes(date)
    const stars = [
      ...MODERN_BODIES.map(([name, body, sourceId]) => starFact(name, '七政', longitudes.get(body)!, isRetrograde(body, date), sourceId, 'astronomy-engine geocentric ecliptic-of-date', '现代天文计算', lifePalace, date)),
      starFact('罗睺(火余)', '四余', residues.rahu, true, 'meeus-mean-lunar-node', 'Meeus mean ascending lunar node approximation', '现代月轨近似', lifePalace, date),
      starFact('计都(土余)', '四余', normalize(residues.rahu + 180), true, 'meeus-mean-lunar-node', 'Opposite the mean ascending lunar node', '现代月轨近似', lifePalace, date),
      starFact('月孛(水余)', '四余', residues.apogee, false, 'meeus-mean-lunar-apogee', 'Meeus mean lunar apogee approximation', '现代月轨近似', lifePalace, date),
      starFact('紫炁(木余)', '四余', residues.ziQi, false, 'qizhengsuan-ziqi', '《七政算内篇》紫炁古法均速', '传统均速模型', lifePalace, date),
    ]
    return {
      ok: true,
      facts: {
        version: QIZHENG_FACT_VERSION,
        evidence: preflight,
        stars,
        aspects: aspectFacts(stars),
        lifePalace,
        bodyPalace,
        lifeMaster: LIFE_MASTERS[lifePalace],
        palaces: PALACES.map((palace, index) => ({ palace, signIndex: normalizeIndex(lifePalace - index, 12) })),
      },
      metadata: LOCAL_METADATA,
    }
  } catch {
    return {
      ok: false,
      failure: { code: 'provider_unavailable', message: 'Local Qizheng calculation could not be completed. No external service or substitute chart was used.' },
      metadata: LOCAL_METADATA,
    }
  }
}

function modernLongitudes(date: Date): Map<Body, number> {
  return new Map(MODERN_BODIES.map(([, body]) => [body, bodyLongitude(body, date)]))
}

function bodyLongitude(body: Body, date: Date): number {
  if (body === Body.Sun) return normalize(SunPosition(date).elon)
  if (body === Body.Moon) return normalize(EclipticGeoMoon(date).lon)
  return normalize(Ecliptic(GeoVector(body, date, true)).elon)
}

function isRetrograde(body: Body, date: Date): boolean {
  if (body === Body.Sun || body === Body.Moon) return false
  const before = bodyLongitude(body, new Date(date.getTime() - 6 * 3_600_000))
  const after = bodyLongitude(body, new Date(date.getTime() + 6 * 3_600_000))
  return signedAngle(after - before) < 0
}

function residualLongitudes(date: Date) {
  const centuries = (date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525
  const rahu = normalize(125.04452 - 1934.136261 * centuries + 0.0020708 * centuries ** 2 + centuries ** 3 / 450_000)
  const perigee = normalize(83.3532465 + 4069.0137287 * centuries - 0.01032 * centuries ** 2 - centuries ** 3 / 80_053)
  const ziQiEpoch = Date.UTC(1995, 11, 31)
  const ziQi = normalize(237.038993 + ((date.getTime() - ziQiEpoch) / 86_400_000) * 360 / 10_227.1792)
  return { rahu, apogee: normalize(perigee + 180), ziQi }
}

function starFact(name: string, kind: '七政' | '四余', longitude: number, retrograde: boolean, sourceId: string, sourceLabel: string, precisionClass: string, lifePalace: number, date: Date): QizhengStarFact {
  const siderealLongitude = toSidereal(longitude, decimalYear(date))
  const mansion = longitudeToQizhengMansion(siderealLongitude)
  const signIndex = Math.floor(siderealLongitude / 30)
  return {
    name, kind, longitude: siderealLongitude, mansion: mansion.name, mansionDegree: mansion.degree,
    palace: PALACES[normalizeIndex(lifePalace - signIndex, 12)], retrograde, dignity: '—',
    sourceId, sourceLabel, precisionClass,
  }
}

function aspectFacts(stars: QizhengStarFact[]): QizhengAspectFact[] {
  const facts: QizhengAspectFact[] = []
  for (let left = 0; left < stars.length; left += 1) {
    for (let right = left + 1; right < stars.length; right += 1) {
      const actualAngle = Math.abs(signedAngle(stars[right].longitude - stars[left].longitude))
      for (const [type, exactAngle, allowedOrb] of ASPECTS) {
        const orb = Math.abs(actualAngle - exactAngle)
        if (orb > allowedOrb) continue
        const ratio = orb / allowedOrb
        const mixed = stars[left].precisionClass !== '现代天文计算' || stars[right].precisionClass !== '现代天文计算'
        facts.push({ star1: stars[left].name, star2: stars[right].name, type, actualAngle, orb, closeness: ratio <= 1 / 3 ? '紧密' : ratio <= 2 / 3 ? '中等' : '宽松', precisionClass: mixed ? '混合模型' : '同层现代天文' })
        break
      }
    }
  }
  return facts.sort((a, b) => a.orb - b.orb)
}

export function longitudeToQizhengMansion(longitude: number): { name: string; degree: number } {
  const normalized = normalize(longitude)
  for (let index = QIZHENG_MANSION_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    if (normalized >= QIZHENG_MANSION_BOUNDARIES[index]) {
      return { name: MANSIONS[index], degree: (normalized - QIZHENG_MANSION_BOUNDARIES[index]) * MANSION_TOTAL / 360 }
    }
  }
  return { name: MANSIONS[0], degree: normalized * MANSION_TOTAL / 360 }
}

function siderealSign(longitude: number, date: Date): number {
  return Math.floor(toSidereal(longitude, decimalYear(date)) / 30)
}

function toSidereal(longitude: number, year: number): number {
  const centuries = (year - 2000) / 100
  const arcSeconds = 5028.796195 * centuries + 1.1054348 * centuries ** 2 + 0.00007964 * centuries ** 3 - 0.000023857 * centuries ** 4
  return normalize(longitude - arcSeconds / 3600)
}

function decimalYear(date: Date): number {
  const year = date.getUTCFullYear()
  return year + (date.getTime() - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1))
}

function shichenIndex(localTime: string): number {
  const hour = Number(localTime.slice(11, 13))
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Invalid resolved local hour')
  return Math.floor((hour + 1) / 2) % 12
}

function utcDate(evidence: QizhengEvidence): Date {
  return new Date(evidence.resolvedUtcTime)
}

function normalize(value: number): number { return value >= 0 && value < 360 ? value : ((value % 360) + 360) % 360 }
function signedAngle(value: number): number { const angle = normalize(value); return angle > 180 ? angle - 360 : angle }
function normalizeIndex(value: number, length: number): number { return ((value % length) + length) % length }
