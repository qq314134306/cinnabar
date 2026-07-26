import type { BirthInfo } from './astro'
import {
  QIZHENG_FACT_VERSION,
  type QizhengFailureCode,
  type QizhengEvidence,
  type QizhengProviderMetadata,
  type QizhengResult,
  type QizhengStarFact,
} from './qizheng-contract'

const metadata = (providerVersion: string | null, source: 'fixture'): QizhengProviderMetadata => ({
  provider: 'aov.cc', providerVersion, adapterVersion: 'qizheng-aov.v1', source,
})

export function buildQizhengEvidence(birth: BirthInfo): QizhengEvidence | null {
  const resolved = birth.resolvedBirthTime
  const place = resolved?.location
  if (!resolved || !place) return null
  if (!isFiniteRange(place.latitude, -90, 90) || !isFiniteRange(place.longitude, -180, 180)) return null
  const timezoneOffsetMinutes = resolved.timezoneOffsetMinutes
  if (!isFiniteRange(timezoneOffsetMinutes, -720, 840) || !Number.isInteger(timezoneOffsetMinutes)) return null
  if (typeof place.tz !== 'string' || !place.tz.trim()) return null
  const localParts = [resolved.year, resolved.month, resolved.day, resolved.hour, resolved.minute]
  if (!validLocalParts(localParts)) return null
  const utcMs = Date.UTC(resolved.year, resolved.month - 1, resolved.day, resolved.hour, resolved.minute) - timezoneOffsetMinutes * 60_000
  if (!timezoneMatchesInstant(place.tz, utcMs, localParts)) return null
  return {
    resolvedLocalTime: `${resolved.year}-${String(resolved.month).padStart(2, '0')}-${String(resolved.day).padStart(2, '0')}T${String(resolved.hour).padStart(2, '0')}:${String(resolved.minute).padStart(2, '0')}:00`,
    resolvedUtcTime: new Date(utcMs).toISOString(),
    latitude: place.latitude,
    longitude: place.longitude,
    timezoneOffsetHours: timezoneOffsetMinutes / 60,
    timezoneId: place.tz,
    locationLabel: place.enName ?? place.name,
  }
}

export function adaptAovQizheng(
  payload: unknown,
  evidence: QizhengEvidence,
  source: 'fixture' = 'fixture',
): QizhengResult {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    return failure('provider_rejected', 'The anonymous Qizheng validation fixture did not return a chart.', null, source)
  }
  const data = payload.data
  if (!Array.isArray(data.stars) || !Array.isArray(data.aspects) || !Array.isArray(data.twelvePalaces)
    || typeof data.mingGong !== 'number' || typeof data.shenGong !== 'number' || typeof data.mingZhu !== 'string') {
    return failure('invalid_provider_contract', 'The Qizheng provider response did not match the verified contract.', providerVersion(payload), source)
  }
  try {
    const stars = data.stars.map((value): QizhengStarFact => {
      const star = requiredRecord(value)
      const kind = requiredString(star.kind)
      if (kind !== '七政' && kind !== '四余') throw new Error('kind')
      return {
        name: requiredString(star.name), kind, longitude: requiredNumber(star.longitude),
        mansion: requiredString(star.xiu), mansionDegree: requiredNumber(star.xiuDegree),
        palace: requiredString(star.palace), retrograde: requiredBoolean(star.retrograde),
        dignity: requiredString(star.dignity), sourceId: requiredString(star.sourceId),
        sourceLabel: requiredString(star.sourceLabel), precisionClass: requiredString(star.precisionClass),
      }
    })
    const aspects = data.aspects.map((value) => {
      const aspect = requiredRecord(value)
      return {
        star1: requiredString(aspect.star1), star2: requiredString(aspect.star2), type: requiredString(aspect.type),
        actualAngle: requiredNumber(aspect.actualAngle), orb: requiredNumber(aspect.orb),
        closeness: requiredString(aspect.closeness), precisionClass: requiredString(aspect.precisionClass),
      }
    })
    const palaces = data.twelvePalaces.map((value) => {
      const palace = requiredRecord(value)
      return { palace: requiredString(palace.palace), signIndex: requiredNumber(palace.signIndex) }
    })
    if (stars.length !== 11 || palaces.length !== 12) throw new Error('cardinality')
    return {
      ok: true,
      facts: { version: QIZHENG_FACT_VERSION, evidence, stars, aspects, lifePalace: data.mingGong, bodyPalace: data.shenGong, lifeMaster: data.mingZhu, palaces },
      metadata: metadata(providerVersion(payload), source),
    }
  } catch {
    return failure('invalid_provider_contract', 'The Qizheng provider response did not match the verified contract.', providerVersion(payload), source)
  }
}

export function qizhengPreflight(birth: BirthInfo): QizhengResult | QizhengEvidence {
  if (birth.birthTimeReliable !== true || birth.birthTimeUnknown) {
    return failure('unreliable_birth_time', 'Qizheng requires a recorded birth time; no time-derived facts were generated.', null, 'fixture')
  }
  const evidence = buildQizhengEvidence(birth)
  return evidence ?? failure('missing_resolved_evidence', 'Qizheng requires the saved resolved time, coordinates, and timezone evidence.', null, 'fixture')
}

function failure(code: QizhengFailureCode, message: string, version: string | null, source: 'fixture'): QizhengResult {
  return { ok: false, failure: { code, message }, metadata: metadata(version, source) }
}
function providerVersion(payload: Record<string, unknown>): string | null { return isRecord(payload.meta) && typeof payload.meta.version === 'string' ? payload.meta.version : null }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function requiredRecord(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw new Error('record'); return value }
function requiredString(value: unknown): string { if (typeof value !== 'string' || !value) throw new Error('string'); return value }
function requiredNumber(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('number'); return value }
function requiredBoolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('boolean'); return value }
function isFiniteRange(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max }
function validLocalParts(parts: number[]): boolean {
  const [year, month, day, hour, minute] = parts
  if (!parts.every(Number.isInteger) || month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
function timezoneMatchesInstant(timezoneId: string, utcMs: number, expected: number[]): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezoneId, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date(utcMs))
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
    return [value('year'), value('month'), value('day'), value('hour'), value('minute')].every((part, index) => part === expected[index])
  } catch {
    return false
  }
}
