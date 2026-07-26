/**
 * [INPUT]: Depends on birth date, selected shichen, and birthplace text
 *          (Chinese names, pinyin like "Zhu Zhou", or world cities like "New York")
 * [OUTPUT]: Provides birthplace matching and true-solar-time birth resolution
 * [POS]: Domain helper between BirthForm input and iztro chart generation
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

export interface Birthplace {
  name: string
  province?: string
  city?: string
  area?: string
  country?: string
  /** English display name (pinyin for Chinese cities), populated by the async loader. */
  enName?: string
  /** IANA timezone (e.g. "America/New_York"). Defaults to Asia/Shanghai when absent. */
  tz?: string
  aliases?: string[]
  /** Normalized latin search keys (pinyin or English), populated by the async loader. */
  latinKeys?: string[]
  longitude: number
  latitude?: number
}

export interface ResolveBirthTimeInput {
  year: number
  month: number
  day: number
  hour: number
  birthplace?: string
  enabled: boolean
  evidence?: BirthTimeEvidence
}

export type BirthTimeSource =
  | 'family_recollection'
  | 'official_record'
  | 'hospital_record'
  | 'unknown'

export type BirthTimeSourceReliability = 'high' | 'medium' | 'low' | 'unknown'
export type BirthTimeUncertainty = 'exact' | 'approximate' | 'unknown'

export interface BirthTimeCandidateRange {
  /** Inclusive wall-clock hour, 0-23. */
  startHour: number
  /** Exclusive wall-clock hour; 0 means midnight at the end of the interval. */
  endHour: number
  crossesMidnight?: boolean
}

export interface BirthTimeEvidence {
  source: BirthTimeSource
  sourceReliability: BirthTimeSourceReliability
  uncertainty: BirthTimeUncertainty
  candidateRange: BirthTimeCandidateRange | null
}

export interface ResolveBirthTimeWithDataInput extends ResolveBirthTimeInput {
  birthplaces?: Birthplace[]
}

export interface ResolvedBirthTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  timeIndex: number
  originalShichen: string
  correctedShichen: string
  correctionMinutes: number
  applied: boolean
  crossedDate: boolean
  location: Birthplace | null
  /** Present on newly resolved values; optional only for persisted legacy shapes. */
  evidence?: BirthTimeEvidence
}

export function reliabilityForBirthTimeSource(
  source: BirthTimeSource,
): BirthTimeSourceReliability {
  if (source === 'official_record' || source === 'hospital_record') return 'high'
  if (source === 'family_recollection') return 'medium'
  return 'unknown'
}

export function createBirthTimeEvidence(
  source: BirthTimeSource,
  uncertainty: BirthTimeUncertainty,
  candidateRange: BirthTimeCandidateRange | null = null,
): BirthTimeEvidence {
  return {
    source,
    sourceReliability: reliabilityForBirthTimeSource(source),
    uncertainty,
    candidateRange,
  }
}

const MINUTES_PER_LONGITUDE_DEGREE = 4
const REPRESENTATIVE_MINUTE = 0
const DEFAULT_TIMEZONE = 'Asia/Shanghai'

const SHICHEN_NAMES = [
  '子时',
  '丑时',
  '寅时',
  '卯时',
  '辰时',
  '巳时',
  '午时',
  '未时',
  '申时',
  '酉时',
  '戌时',
  '亥时',
] as const

export function findBirthplace(input?: string): Birthplace | null {
  return findBirthplaceInData(input, [])
}

export async function findBirthplaceAsync(input?: string): Promise<Birthplace | null> {
  const birthplaces = await loadBirthplaceData()
  return findBirthplaceInData(input, birthplaces)
}

export function isExactBirthplaceMatch(
  query: string,
  place: Birthplace,
): boolean {
  if (/[\u3400-\u9fff]/u.test(query)) {
    const normalized = query.trim().replace(/\s+/gu, '')
    const candidates = [
      place.name,
      place.province,
      place.city,
      place.area,
      [place.province, place.city].filter(Boolean).join(''),
      [place.city, place.area].filter(Boolean).join(''),
      [place.province, place.city, place.area].filter(Boolean).join(''),
    ]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => candidate.trim().replace(/\s+/gu, ''))

    return candidates.some((candidate) => (
      candidate === normalized
      || stripAdministrativeSuffix(candidate) === stripAdministrativeSuffix(normalized)
    ))
  }

  const normalized = normalizeLatin(query)
  return Boolean(
    normalized
    && place.latinKeys?.some((candidate) => candidate === normalized),
  )
}

export function findBirthplaceInData(input: string | undefined, birthplaces: Birthplace[]): Birthplace | null {
  const normalized = normalizePlace(input)
  if (!normalized) return null

  const scorer = hasCjk(normalized)
    ? scoreBirthplaceMatch
    : (query: string, place: Birthplace) => scoreLatinMatch(normalizeLatin(query), place)

  const ranked = birthplaces
    .map((place) => ({ place, score: scorer(normalized, place) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.place ?? null
}

/* ------------------------------------------------------------
   Latin-script matching (pinyin for Chinese cities, English for
   world cities). Case-insensitive; spaces and punctuation ignored,
   so "Zhu Zhou", "zhuzhou", and "ZHUZHOU" all match 株洲.
   ------------------------------------------------------------ */

function hasCjk(value: string): boolean {
  return /[一-鿿]/u.test(value)
}

function normalizeLatin(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '') // strip diacritics: São → Sao
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
}

function scoreLatinMatch(query: string, place: Birthplace): number {
  if (query.length < 2 || !place.latinKeys?.length) return 0

  let best = 0
  for (const key of place.latinKeys) {
    if (!key) continue
    if (key === query) {
      // Exact match; world cities (carrying tz) win ties against pinyin homophones.
      best = Math.max(best, place.tz ? 100 : 95)
    } else if (query.length >= 4 && key.startsWith(query)) {
      best = Math.max(best, 60)
    }
  }
  return best
}

export async function resolveBirthTimeAsync(input: ResolveBirthTimeInput): Promise<ResolvedBirthTime> {
  if (!input.enabled || !input.birthplace?.trim()) {
    return resolveBirthTime({ ...input, birthplaces: [] })
  }
  const birthplaces = await loadBirthplaceData()
  return resolveBirthTime({ ...input, birthplaces })
}

export function resolveBirthTime(input: ResolveBirthTimeWithDataInput): ResolvedBirthTime {
  const originalTimeIndex = hourToTimeIndex(input.hour)
  const originalShichen = shichenNameForTimeIndex(originalTimeIndex)
  const location = findBirthplaceInData(input.birthplace, input.birthplaces ?? [])
  const shouldApply = input.enabled && location !== null

  // Treat the entered values as timezone-free wall-clock fields. UTC getters
  // make the same birth input resolve identically in a browser, Node test, and
  // a Vercel Edge isolate regardless of the host machine's timezone/DST.
  const baseDate = new Date(Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    REPRESENTATIVE_MINUTE,
  ))
  const correctionMinutes = shouldApply
    ? getTrueSolarCorrectionMinutes(input.year, input.month, input.day, input.hour, location)
    : 0
  const correctedDate = new Date(baseDate.getTime() + correctionMinutes * 60_000)
  const timeIndex = shouldApply
    ? dateToTimeIndex(correctedDate)
    : originalTimeIndex
  const correctedShichen = shichenNameForTimeIndex(timeIndex)

  return {
    year: correctedDate.getUTCFullYear(),
    month: correctedDate.getUTCMonth() + 1,
    day: correctedDate.getUTCDate(),
    hour: correctedDate.getUTCHours(),
    minute: correctedDate.getUTCMinutes(),
    timeIndex,
    originalShichen,
    correctedShichen,
    correctionMinutes: Math.round(correctionMinutes),
    applied: shouldApply,
    crossedDate: isDifferentDate(input, correctedDate),
    location,
    evidence: input.evidence ?? createBirthTimeEvidence('unknown', 'exact'),
  }
}

let birthplaceIndexPromise: Promise<Birthplace[]> | null = null

async function loadBirthplaceData(): Promise<Birthplace[]> {
  const request = birthplaceIndexPromise ??= buildBirthplaceIndex()
  try {
    return await request
  } catch (error) {
    if (birthplaceIndexPromise === request) {
      birthplaceIndexPromise = null
    }
    throw error
  }
}

async function buildBirthplaceIndex(): Promise<Birthplace[]> {
  const [chinaMod, worldMod, pinyinMod] = await Promise.all([
    import('./birthplace-data.json'),
    import('./world-cities.json'),
    import('pinyin-pro'),
  ])
  const { pinyin } = pinyinMod

  const toPinyinKey = (text: string): string =>
    normalizeLatin(pinyin(text, { toneType: 'none', type: 'array' }).join(''))

  const chinaPlaces = (chinaMod.default as Birthplace[]).map((place) => {
    const keys = new Set<string>()
    for (const token of [place.name, place.city, place.area]) {
      if (!token) continue
      keys.add(toPinyinKey(token))
      const stripped = stripAdministrativeSuffix(token)
      if (stripped && stripped !== token) keys.add(toPinyinKey(stripped))
    }
    const bare = stripAdministrativeSuffix(place.name) || place.name
    const romanized = pinyin(bare, { toneType: 'none', type: 'array' }).join('')
    const enName = romanized ? romanized.charAt(0).toUpperCase() + romanized.slice(1) : place.name
    return { ...place, enName, latinKeys: Array.from(keys) }
  })

  // World cities lead the list so an exact English name beats a pinyin homophone.
  const worldPlaces = (worldMod.default as Birthplace[]).map((place) => ({
    ...place,
    enName: place.name,
    latinKeys: [place.name, ...(place.aliases ?? [])].map(normalizeLatin),
  }))

  return [...worldPlaces, ...chinaPlaces]
}

export function shichenNameForTimeIndex(timeIndex: number): string {
  if (timeIndex === 12) return SHICHEN_NAMES[0]
  return SHICHEN_NAMES[timeIndex] ?? ''
}

function normalizePlace(input?: string): string {
  return (input ?? '').trim().replace(/\s+/g, '')
}

function scoreBirthplaceMatch(input: string, place: Birthplace): number {
  const fullTokens = [
    joinPlace(place.province, place.city, place.area),
    joinPlace(place.province, place.city),
    joinPlace(place.city, place.area),
  ].filter((token): token is string => !!token).map(normalizePlace)
  const localTokens = [place.name, place.area, place.city]
    .filter((token): token is string => !!token)
    .map(normalizePlace)
  const tokens = getPlaceTokens(place)

  if (tokens.some((token) => token === input)) return 100
  if (fullTokens.some((token) => equalsWithoutAdministrativeSuffix(input, token))) return 95
  if (localTokens.some((token) => equalsWithoutAdministrativeSuffix(input, token))) return 90
  if (fullTokens.some((token) => isSpecificToken(token) && input.includes(token))) return 85
  if (localTokens.some((token) => isSpecificToken(token) && input.includes(token))) return 80
  if (localTokens.some((token) => {
    const stripped = stripAdministrativeSuffix(token)
    return isSpecificToken(stripped) && input.includes(stripped)
  })) return 60
  return 0
}

function getPlaceTokens(place: Birthplace): string[] {
  const rawTokens = [
    place.name,
    place.province,
    place.city,
    place.area,
    joinPlace(place.province, place.city),
    joinPlace(place.city, place.area),
    joinPlace(place.province, place.city, place.area),
  ]

  return Array.from(new Set(rawTokens.filter((token): token is string => !!token).map(normalizePlace)))
}

function joinPlace(...parts: Array<string | undefined>): string | undefined {
  const value = parts.filter(Boolean).join('')
  return value || undefined
}

function stripAdministrativeSuffix(value: string): string {
  return value.replace(/(特别行政区|自治州|地区|盟|市|县|区|省)$/u, '')
}

function equalsWithoutAdministrativeSuffix(left: string, right: string): boolean {
  const normalizedLeft = stripAdministrativeSuffix(left)
  const normalizedRight = stripAdministrativeSuffix(right)

  return isSpecificToken(normalizedLeft) && normalizedLeft === normalizedRight
}

function isSpecificToken(value: string): boolean {
  return value.length >= 2
}

/**
 * True solar correction = (solar mean time) − (clock time at the birthplace).
 * Solar mean time runs at longitude × 4 min ahead of UTC; the clock runs at the
 * birthplace's UTC offset (DST-aware via Intl). China entries carry no tz and
 * default to Asia/Shanghai (+480), matching the classic (lon − 120°) × 4 rule.
 */
function getTrueSolarCorrectionMinutes(
  year: number,
  month: number,
  day: number,
  hour: number,
  place: Birthplace
): number {
  const offsetMinutes = getUtcOffsetMinutes(place.tz ?? DEFAULT_TIMEZONE, year, month, day, hour)
  return place.longitude * MINUTES_PER_LONGITUDE_DEGREE
    - offsetMinutes
    + getEquationOfTimeMinutes(year, month, day)
}

/**
 * UTC offset (minutes) of an IANA timezone at a given local wall time,
 * computed with the built-in Intl API — no timezone library needed.
 */
function getUtcOffsetMinutes(tz: string, year: number, month: number, day: number, hour: number): number {
  try {
    // Treat the wall time as a UTC guess, then refine once so DST transitions land correctly.
    const instant = Date.UTC(year, month - 1, day, hour, REPRESENTATIVE_MINUTE)
    let offset = offsetAtInstant(tz, instant)
    offset = offsetAtInstant(tz, instant - offset * 60_000)
    return offset
  } catch {
    // Unknown zone identifier: fall back to China standard time.
    return 480
  }
}

function offsetAtInstant(tz: string, instantMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(instantMs))) {
    parts[part.type] = part.value
  }
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return Math.round((wallAsUtc - instantMs) / 60_000)
}

function getEquationOfTimeMinutes(year: number, month: number, day: number): number {
  const date = Date.UTC(year, month - 1, day)
  const start = Date.UTC(year, 0, 0)
  const dayOfYear = Math.floor((date - start) / 86_400_000)
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364

  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

function hourToTimeIndex(hour: number): number {
  if (hour === 23) return 12
  if (hour >= 0 && hour < 1) return 0
  return Math.floor((hour + 1) / 2)
}

function dateToTimeIndex(date: Date): number {
  const hour = date.getUTCHours()
  if (hour === 23) return 12
  if (hour === 0) return 0
  return Math.floor((hour + 1) / 2)
}

function isDifferentDate(input: ResolveBirthTimeInput, date: Date): boolean {
  return (
    input.year !== date.getUTCFullYear()
    || input.month !== date.getUTCMonth() + 1
    || input.day !== date.getUTCDate()
  )
}
