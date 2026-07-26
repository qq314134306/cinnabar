export const QUESTION_EVENT_VERSION = 'question-event.v1' as const

export type QuestionMethod = 'liuyao' | 'qimen' | 'liuren'

export interface LocationEvidence {
  readonly label: string
  readonly timezone: string
  readonly source: 'user-entered'
  readonly capturedAt: string
}

export interface QuestionEvent {
  readonly version: typeof QUESTION_EVENT_VERSION
  readonly question: string
  readonly capturedAt: string
  readonly timezone: string
  readonly location: LocationEvidence
}

export interface ProviderMetadata {
  readonly provider: 'cinnabar-local'
  readonly providerVersion: '2026-07-26.v1'
  readonly contractVersion: string
  readonly status: 'ok' | 'failed'
  readonly failure?: {
    readonly code: 'INVALID_EVENT' | 'UNSUPPORTED_TIMEZONE' | 'CALCULATION_FAILED' | 'ENGINE_UNAVAILABLE'
    readonly message: string
  }
}

export interface LiuYaoFacts {
  readonly contract: 'liuyao.facts.v1'
  readonly casting: 'time-seeded-local-v1'
  readonly primaryHexagram: number
  readonly changedHexagram: number
  readonly movingLine: number
  readonly lines: readonly (6 | 7 | 8 | 9)[]
}

export interface QimenFacts {
  readonly contract: 'qimen.facts.v1'
  readonly ruleset: 'mainline-cn-v1-minimal'
  readonly dun: 'yin' | 'yang'
  readonly ju: number
  readonly hourBranch: string
  readonly dutyPalace: number
  readonly palaceOrder: readonly number[]
}

export interface LiuRenFacts {
  readonly contract: 'liuren.facts.v1'
  readonly ruleset: 'cinnabar-liuren-local-v1'
  readonly monthGeneral: string
  readonly hourBranch: string
  readonly heavenPlateOffset: number
  readonly threeTransmissions: readonly [string, string, string]
}

export type MethodFacts = {
  liuyao: LiuYaoFacts
  qimen: QimenFacts
  liuren: LiuRenFacts
}

export type FactResult<M extends QuestionMethod = QuestionMethod> = {
  readonly method: M
  readonly event: QuestionEvent
  readonly entitlement: {
    readonly tier: 'free'
    readonly product: 'question-structural-facts'
  }
  readonly metadata: ProviderMetadata
  readonly facts?: MethodFacts[M]
}

const BRANCHES = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'] as const
const PALACE_RING = [1, 8, 3, 4, 9, 2, 7, 6] as const

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

export function createQuestionEvent(input: {
  question: string
  capturedAt: string
  timezone: string
  locationLabel: string
}): QuestionEvent {
  const question = input.question.trim()
  const locationLabel = input.locationLabel.trim()
  const captured = new Date(input.capturedAt)
  if (!question || question.length > 500 || Number.isNaN(captured.getTime())) {
    throw new Error('Question and a valid capture time are required.')
  }
  if (!locationLabel || !isSupportedTimezone(input.timezone)) {
    throw new Error('A location and supported IANA timezone are required.')
  }
  const capturedAt = captured.toISOString()
  return deepFreeze({
    version: QUESTION_EVENT_VERSION,
    question,
    capturedAt,
    timezone: input.timezone,
    location: {
      label: locationLabel,
      timezone: input.timezone,
      source: 'user-entered',
      capturedAt,
    },
  }) as QuestionEvent
}

function isSupportedTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

interface LocalDateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error('Capture time must use YYYY-MM-DDTHH:mm.')
  const [, year, month, day, hour, minute, second = '0'] = match
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) }
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59 || parts.second > 59) {
    throw new Error('Capture time is not a valid calendar time.')
  }
  return parts
}

function offsetMinutesAt(instant: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value
  if (name === 'GMT' || name === 'UTC') return 0
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '')
  if (!match) throw new Error('The timezone offset could not be resolved.')
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '+' ? minutes : -minutes
}

function partsAt(instant: Date, timezone: string): LocalDateTimeParts {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((part) => part.type === type)?.value)
  return { year: number('year'), month: number('month'), day: number('day'), hour: number('hour'), minute: number('minute'), second: number('second') }
}

export function zonedLocalDateTimeToUtc(value: string, timezone: string): string {
  if (!isSupportedTimezone(timezone)) throw new Error('A supported IANA timezone is required.')
  const wanted = parseLocalDateTime(value)
  const wallClockAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second)
  const offsets = new Set([-172_800_000, 0, 172_800_000].map((delta) => offsetMinutesAt(new Date(wallClockAsUtc + delta), timezone)))
  const matches = [...offsets]
    .map((offset) => new Date(wallClockAsUtc - offset * 60_000))
    .filter((instant) => JSON.stringify(partsAt(instant, timezone)) === JSON.stringify(wanted))
  if (matches.length === 0) throw new Error('This local time does not exist because of a timezone clock change.')
  if (matches.length > 1) throw new Error('This local time is ambiguous because of a timezone clock change.')
  return matches[0].toISOString()
}

function localParts(event: QuestionEvent) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone,
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(event.capturedAt))
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: number('year'), month: number('month'), day: number('day'), hour: number('hour') }
}

function hashQuestion(question: string): number {
  let hash = 2166136261
  for (const char of question) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
  return hash >>> 0
}

function metadata(contractVersion: string): ProviderMetadata {
  return { provider: 'cinnabar-local', providerVersion: '2026-07-26.v1', contractVersion, status: 'ok' }
}

const FREE_FACTS = deepFreeze({
  tier: 'free' as const,
  product: 'question-structural-facts' as const,
})

/** @deprecated Development placeholder. Never call from a production entry point. */
export function calculateLiuYao(event: QuestionEvent): FactResult<'liuyao'> {
  const time = Math.floor(new Date(event.capturedAt).getTime() / 60_000)
  const seed = (time ^ hashQuestion(event.question)) >>> 0
  const lines = Array.from({ length: 6 }, (_, index) => (6 + ((seed >>> (index * 2)) & 3)) as 6 | 7 | 8 | 9)
  const moving = lines.findIndex((line) => line === 6 || line === 9)
  const movingLine = moving < 0 ? (seed % 6) + 1 : moving + 1
  const binary = lines.reduce((value, line, index) => value | ((line % 2) << index), 0)
  return deepFreeze({ method: 'liuyao', event, entitlement: FREE_FACTS, metadata: metadata('liuyao.facts.v1'), facts: {
    contract: 'liuyao.facts.v1', casting: 'time-seeded-local-v1', primaryHexagram: binary + 1,
    changedHexagram: (binary ^ (1 << (movingLine - 1))) + 1, movingLine, lines,
  } }) as FactResult<'liuyao'>
}

/** @deprecated Development placeholder. Never call from a production entry point. */
export function calculateQimen(event: QuestionEvent): FactResult<'qimen'> {
  const { month, day, hour } = localParts(event)
  const hourBranchIndex = Math.floor(((hour + 1) % 24) / 2)
  const ju = ((month + day + hourBranchIndex - 1) % 9) + 1
  const yang = month <= 6 || month === 12
  const order = yang ? [...PALACE_RING] : [...PALACE_RING].reverse()
  const dutyPalace = order[(ju + hourBranchIndex - 1) % order.length]
  return deepFreeze({ method: 'qimen', event, entitlement: FREE_FACTS, metadata: metadata('qimen.facts.v1'), facts: {
    contract: 'qimen.facts.v1', ruleset: 'mainline-cn-v1-minimal', dun: yang ? 'yang' : 'yin',
    ju, hourBranch: BRANCHES[hourBranchIndex], dutyPalace, palaceOrder: order,
  } }) as FactResult<'qimen'>
}

/** @deprecated Development placeholder. Never call from a production entry point. */
export function calculateLiuRen(event: QuestionEvent): FactResult<'liuren'> {
  const { month, day, hour } = localParts(event)
  const hourIndex = Math.floor(((hour + 1) % 24) / 2)
  const generalIndex = (12 - month) % 12
  const offset = (generalIndex - hourIndex + 12) % 12
  const first = (day + offset - 1) % 12
  return deepFreeze({ method: 'liuren', event, entitlement: FREE_FACTS, metadata: metadata('liuren.facts.v1'), facts: {
    contract: 'liuren.facts.v1', ruleset: 'cinnabar-liuren-local-v1', monthGeneral: BRANCHES[generalIndex],
    hourBranch: BRANCHES[hourIndex], heavenPlateOffset: offset,
    threeTransmissions: [BRANCHES[first], BRANCHES[(first + 4) % 12], BRANCHES[(first + 8) % 12]],
  } }) as FactResult<'liuren'>
}

/** @deprecated Development placeholder bundle. Never call from a production entry point. */
export function calculateQuestionCharts(event: QuestionEvent) {
  return deepFreeze({
    event,
    results: [calculateLiuYao(event), calculateQimen(event), calculateLiuRen(event)],
  })
}

export function createUnavailableQuestionResults(event: QuestionEvent) {
  const result = <M extends QuestionMethod>(method: M, contractVersion: MethodFacts[M]['contract']): FactResult<M> => deepFreeze({
    method,
    event,
    entitlement: FREE_FACTS,
    metadata: {
      provider: 'cinnabar-local',
      providerVersion: '2026-07-26.v1',
      contractVersion,
      status: 'failed',
      failure: {
        code: 'ENGINE_UNAVAILABLE',
        message: 'The verified local engine is not available yet. No chart was generated and no external service was called.',
      },
    },
  }) as FactResult<M>
  return deepFreeze({
    event,
    results: [
      result('liuyao', 'liuyao.facts.v1'),
      result('qimen', 'qimen.facts.v1'),
      result('liuren', 'liuren.facts.v1'),
    ],
  })
}
