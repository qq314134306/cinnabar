/**
 * [INPUT]: A small, structured browser birth/persona request plus a trusted paid tier
 * [OUTPUT]: Server-rebuilt Zi Wei chart facts, tier-bounded yearly facts, and fingerprint
 * [POS]: Server-only trust boundary between Future Report HTTP handlers and chart/prompt code
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  forecastYears,
  type Persona,
} from '../src/lib/ai-prompts'
import {
  generateChart,
  type BirthInfo,
  type Gender,
} from '../src/lib/astro'
import {
  buildYearlyChartFacts,
  buildZiWeiChartFacts,
} from '../src/lib/chart-facts'
import {
  isExactBirthplaceMatch,
  resolveBirthTime,
  resolveBirthTimeAsync,
  type Birthplace,
  type ResolvedBirthTime,
} from '../src/lib/true-solar-time'
import type { FutureReportTier } from './_paypal'
import { HttpError } from './_require-user'

export const FUTURE_REPORT_SNAPSHOT_VERSION = 'future-report.server-chart.v1'

const ROOT_KEYS = new Set(['birth', 'persona'])
const BIRTH_KEYS = new Set([
  'year',
  'month',
  'day',
  'hour',
  'gender',
  'birthplace',
  'trueSolarEnabled',
  'birthTimeReliable',
])
const PLACE_TEXT_RE = /^[\p{L}\p{M}\p{N}\s.'’(),-]+$/u
const MAX_PLACE_LENGTH = 80
const MIN_SUPPORTED_YEAR = 1900

export interface FutureReportBirthRequest {
  year: number
  month: number
  day: number
  hour: number
  gender: Gender
  birthplace?: string
  trueSolarEnabled: boolean
  birthTimeReliable: boolean
}

export interface FutureReportRequestInput {
  birth: FutureReportBirthRequest
  persona: Persona
}

interface CanonicalLocation {
  name: string
  country: string | null
  timezone: string
  longitude: number
}

interface CanonicalResolvedBirth {
  date: string
  hour: number
  minute: number
  timeIndex: number
  correctionMinutes: number
  trueSolarApplied: boolean
}

export interface ServerBirthSnapshot {
  calendar: 'solar'
  date: string
  hour: number
  gender: Gender
  birthTimeReliable: boolean
  trueSolarEnabled: boolean
  location: CanonicalLocation | null
  resolved: CanonicalResolvedBirth
}

export interface GenerationInput {
  snapshotVersion: typeof FUTURE_REPORT_SNAPSHOT_VERSION
  birth: ServerBirthSnapshot
  persona: Persona
  currentYear: number
  years: number[]
  chartFacts: string
  yearlyFacts: string
  chartFingerprint: string
}

export interface ChartIdentity {
  birth: ServerBirthSnapshot
  chart: ReturnType<typeof generateChart>
  birthInfo: BirthInfo
  chartFacts: string
  chartFingerprint: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[],
): void {
  const keys = Object.keys(value)
  if (
    keys.some((key) => !allowed.has(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new HttpError(
      'Report input contains unsupported fields.',
      400,
      'INVALID_REPORT_INPUT',
    )
  }
}

function parseInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new HttpError(`${label} is invalid.`, 400, 'INVALID_BIRTH_INPUT')
  }
  return value as number
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function validateBirthDate(
  year: number,
  month: number,
  day: number,
  now: Date,
): void {
  const value = new Date(Date.UTC(year, month - 1, day))
  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
    || value.getTime() > now.getTime()
  ) {
    throw new HttpError('Birth date is invalid.', 400, 'INVALID_BIRTH_DATE')
  }
}

function parseBirthplace(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new HttpError('Birthplace is invalid.', 400, 'INVALID_BIRTHPLACE')
  }
  const trimmed = value.trim().replace(/\s+/gu, ' ')
  if (
    !trimmed
    || trimmed.length > MAX_PLACE_LENGTH
    || !PLACE_TEXT_RE.test(trimmed)
  ) {
    throw new HttpError('Birthplace is invalid.', 400, 'INVALID_BIRTHPLACE')
  }
  return trimmed
}

export function parseFutureReportRequestInput(
  value: unknown,
  now = new Date(),
): FutureReportRequestInput {
  if (!isRecord(value)) {
    throw new HttpError('Report input is required before capture.', 400, 'INVALID_REPORT_INPUT')
  }
  requireExactKeys(value, ROOT_KEYS, ['birth', 'persona'])

  if (value.persona !== 'scholar' && value.persona !== 'sage') {
    throw new HttpError('Report persona is invalid.', 400, 'INVALID_REPORT_INPUT')
  }
  if (!isRecord(value.birth)) {
    throw new HttpError('Birth input is required.', 400, 'INVALID_BIRTH_INPUT')
  }
  requireExactKeys(
    value.birth,
    BIRTH_KEYS,
    [
      'year',
      'month',
      'day',
      'hour',
      'gender',
      'trueSolarEnabled',
      'birthTimeReliable',
    ],
  )

  const currentYear = now.getUTCFullYear()
  const year = parseInteger(
    value.birth.year,
    'Birth year',
    MIN_SUPPORTED_YEAR,
    currentYear,
  )
  const month = parseInteger(value.birth.month, 'Birth month', 1, 12)
  const day = parseInteger(value.birth.day, 'Birth day', 1, 31)
  const hour = parseInteger(value.birth.hour, 'Birth hour', 0, 23)
  validateBirthDate(year, month, day, now)

  if (value.birth.gender !== 'male' && value.birth.gender !== 'female') {
    throw new HttpError('Birth gender is invalid.', 400, 'INVALID_BIRTH_INPUT')
  }
  if (
    typeof value.birth.trueSolarEnabled !== 'boolean'
    || typeof value.birth.birthTimeReliable !== 'boolean'
  ) {
    throw new HttpError('Birth-time settings are invalid.', 400, 'INVALID_BIRTH_INPUT')
  }

  return {
    birth: {
      year,
      month,
      day,
      hour,
      gender: value.birth.gender,
      birthplace: parseBirthplace(value.birth.birthplace),
      trueSolarEnabled: value.birth.trueSolarEnabled,
      birthTimeReliable: value.birth.birthTimeReliable,
    },
    persona: value.persona,
  }
}

async function resolveTrustedBirthTime(
  birth: FutureReportBirthRequest,
): Promise<ResolvedBirthTime> {
  if (!birth.trueSolarEnabled || !birth.birthplace) {
    return resolveBirthTime({
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      enabled: false,
    })
  }

  const resolved = await resolveBirthTimeAsync({
    year: birth.year,
    month: birth.month,
    day: birth.day,
    hour: birth.hour,
    birthplace: birth.birthplace,
    enabled: birth.trueSolarEnabled,
  })
  if (
    !resolved.location
    || !isExactBirthplaceMatch(birth.birthplace, resolved.location)
  ) {
    throw new HttpError(
      'Birthplace could not be matched exactly.',
      400,
      'INVALID_BIRTHPLACE',
    )
  }
  return resolved
}

function canonicalLocation(place: Birthplace | null): CanonicalLocation | null {
  if (!place) return null
  return {
    name: place.enName ?? place.name,
    country: place.country ?? null,
    timezone: place.tz ?? 'Asia/Shanghai',
    longitude: place.longitude,
  }
}

function createBirthSnapshot(
  birth: FutureReportBirthRequest,
  resolved: ResolvedBirthTime,
): ServerBirthSnapshot {
  return {
    calendar: 'solar',
    date: isoDate(birth.year, birth.month, birth.day),
    hour: birth.hour,
    gender: birth.gender,
    birthTimeReliable: birth.birthTimeReliable,
    trueSolarEnabled: birth.trueSolarEnabled,
    location: canonicalLocation(resolved.location),
    resolved: {
      date: isoDate(resolved.year, resolved.month, resolved.day),
      hour: resolved.hour,
      minute: resolved.minute,
      timeIndex: resolved.timeIndex,
      correctionMinutes: resolved.correctionMinutes,
      trueSolarApplied: resolved.applied,
    },
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function rebuildChartIdentity(
  value: unknown,
  now = new Date(),
): Promise<ChartIdentity & { persona: Persona }> {
  const input = parseFutureReportRequestInput(value, now)
  const resolved = await resolveTrustedBirthTime(input.birth)
  const birthInfo: BirthInfo = {
    year: input.birth.year,
    month: input.birth.month,
    day: input.birth.day,
    hour: input.birth.hour,
    gender: input.birth.gender,
    trueSolarEnabled: input.birth.trueSolarEnabled,
    birthTimeReliable: input.birth.birthTimeReliable,
    resolvedBirthTime: resolved,
  }
  const chart = generateChart(birthInfo)
  const chartFacts = buildZiWeiChartFacts(chart, birthInfo)
  const birth = createBirthSnapshot(input.birth, resolved)
  const chartFingerprint = await sha256(JSON.stringify({
    snapshotVersion: FUTURE_REPORT_SNAPSHOT_VERSION,
    birth,
  }))

  return {
    birth,
    chart,
    birthInfo,
    chartFacts,
    chartFingerprint,
    persona: input.persona,
  }
}

export async function rebuildFutureReportSnapshot(
  value: unknown,
  tier: FutureReportTier,
  now = new Date(),
): Promise<GenerationInput> {
  const parsed = parseFutureReportRequestInput(value, now)
  const adultAt = Date.UTC(
    parsed.birth.year + 18,
    parsed.birth.month - 1,
    parsed.birth.day,
  )
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  if (today < adultAt) {
    throw new HttpError(
      'Future Reports are available only to adults age 18 or older.',
      403,
      'MINOR_NOT_ELIGIBLE',
    )
  }

  const identity = await rebuildChartIdentity(parsed, now)
  const currentYear = now.getUTCFullYear()
  const years = forecastYears(tier, currentYear)
  const yearlyFacts = buildYearlyChartFacts(
    identity.chart,
    identity.birthInfo,
    years,
  )

  if (
    !identity.chartFacts
    || identity.chartFacts.length > 30_000
    || !yearlyFacts
    || yearlyFacts.length > 30_000
  ) {
    throw new Error('Server-generated chart facts exceeded the supported bounds.')
  }

  return {
    snapshotVersion: FUTURE_REPORT_SNAPSHOT_VERSION,
    birth: identity.birth,
    persona: identity.persona,
    currentYear,
    years,
    chartFacts: identity.chartFacts,
    yearlyFacts,
    chartFingerprint: identity.chartFingerprint,
  }
}

export function assertTrustedGenerationInput(
  value: unknown,
  tier: FutureReportTier,
  chartFingerprint: string | null,
): asserts value is GenerationInput {
  if (!isRecord(value)) {
    throw new HttpError('The saved report input is unavailable.', 409, 'INVALID_SAVED_REPORT_INPUT')
  }
  const expectedLength = tier === '1-year' ? 2 : 5
  const birth = isRecord(value.birth) ? value.birth : null
  const location = birth && isRecord(birth.location) ? birth.location : birth?.location
  const resolved = birth && isRecord(birth.resolved) ? birth.resolved : null
  const birthIsValid = Boolean(
    birth
    && Object.keys(birth).length === 8
    && birth.calendar === 'solar'
    && typeof birth.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(birth.date)
    && Number.isInteger(birth.hour)
    && (birth.hour as number) >= 0
    && (birth.hour as number) <= 23
    && (birth.gender === 'male' || birth.gender === 'female')
    && typeof birth.birthTimeReliable === 'boolean'
    && typeof birth.trueSolarEnabled === 'boolean'
    && (
      location === null
      || (
        isRecord(location)
        && Object.keys(location).length === 4
        && typeof location.name === 'string'
        && location.name.length > 0
        && (location.country === null || typeof location.country === 'string')
        && typeof location.timezone === 'string'
        && location.timezone.length > 0
        && typeof location.longitude === 'number'
        && Number.isFinite(location.longitude)
        && location.longitude >= -180
        && location.longitude <= 180
      )
    )
    && resolved
    && Object.keys(resolved).length === 6
    && typeof resolved.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(resolved.date)
    && Number.isInteger(resolved.hour)
    && (resolved.hour as number) >= 0
    && (resolved.hour as number) <= 23
    && Number.isInteger(resolved.minute)
    && (resolved.minute as number) >= 0
    && (resolved.minute as number) <= 59
    && Number.isInteger(resolved.timeIndex)
    && (resolved.timeIndex as number) >= 0
    && (resolved.timeIndex as number) <= 12
    && Number.isInteger(resolved.correctionMinutes)
    && Math.abs(resolved.correctionMinutes as number) <= 1_440
    && typeof resolved.trueSolarApplied === 'boolean'
  )
  if (
    value.snapshotVersion !== FUTURE_REPORT_SNAPSHOT_VERSION
    || (value.persona !== 'scholar' && value.persona !== 'sage')
    || typeof value.chartFacts !== 'string'
    || !value.chartFacts
    || value.chartFacts.length > 30_000
    || typeof value.yearlyFacts !== 'string'
    || !value.yearlyFacts
    || value.yearlyFacts.length > 30_000
    || typeof value.chartFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.chartFingerprint)
    || chartFingerprint !== value.chartFingerprint
    || !Number.isInteger(value.currentYear)
    || (value.currentYear as number) < MIN_SUPPORTED_YEAR
    || (value.currentYear as number) > 3000
    || !Array.isArray(value.years)
    || value.years.length !== expectedLength
    || value.years.some((year, index) => (
      !Number.isInteger(year)
      || year !== (value.currentYear as number) + index
    ))
    || !birthIsValid
  ) {
    throw new HttpError(
      'The saved report input is invalid.',
      409,
      'INVALID_SAVED_REPORT_INPUT',
    )
  }
}
