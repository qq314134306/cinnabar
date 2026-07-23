import type { BirthInfo, Gender } from './astro'

export const READING_CONTRACT_VERSION = 'reading.v1' as const

export type ReadingPersona = 'scholar' | 'sage'

export interface ReadingBirthBasic {
  year: number
  month: number
  day: number
  hour: number
  gender: Gender
}

export interface ReadingBirthFull extends ReadingBirthBasic {
  birthplace?: string
  trueSolarEnabled: boolean
  birthTimeReliable: boolean
}

export interface NatalReadingRequest {
  version: typeof READING_CONTRACT_VERSION
  operation: 'natal'
  persona: ReadingPersona
  birth: ReadingBirthFull
}

export interface CompatibilityReadingRequest {
  version: typeof READING_CONTRACT_VERSION
  operation: 'compatibility'
  persona: ReadingPersona
  personA: ReadingBirthBasic
  personB: ReadingBirthBasic
}

export interface YearlyReadingRequest {
  version: typeof READING_CONTRACT_VERSION
  operation: 'yearly'
  persona: ReadingPersona
  birth: ReadingBirthFull
  year: number
}

export type ReadingRequest =
  | NatalReadingRequest
  | CompatibilityReadingRequest
  | YearlyReadingRequest

/**
 * Projects browser chart state onto the public reading contract.
 * Derived/corrected chart data is deliberately not part of this allowlist.
 */
export function serializeFullBirthInfo(birthInfo: BirthInfo): ReadingBirthFull {
  const birthplace = birthInfo.birthplace?.trim()

  return {
    year: birthInfo.year,
    month: birthInfo.month,
    day: birthInfo.day,
    hour: birthInfo.hour,
    gender: birthInfo.gender,
    ...(birthplace ? { birthplace } : {}),
    trueSolarEnabled: birthInfo.trueSolarEnabled ?? true,
    birthTimeReliable: birthInfo.birthTimeReliable ?? false,
  }
}

/** Projects a person onto the smaller compatibility contract. */
export function serializeBasicBirthInfo(birthInfo: BirthInfo): ReadingBirthBasic {
  return {
    year: birthInfo.year,
    month: birthInfo.month,
    day: birthInfo.day,
    hour: birthInfo.hour,
    gender: birthInfo.gender,
  }
}

export function buildNatalReadingRequest(
  birthInfo: BirthInfo,
  persona: ReadingPersona,
): NatalReadingRequest {
  return {
    version: READING_CONTRACT_VERSION,
    operation: 'natal',
    persona,
    birth: serializeFullBirthInfo(birthInfo),
  }
}

export function buildCompatibilityReadingRequest(
  personA: BirthInfo,
  personB: BirthInfo,
  persona: ReadingPersona,
): CompatibilityReadingRequest {
  return {
    version: READING_CONTRACT_VERSION,
    operation: 'compatibility',
    persona,
    personA: serializeBasicBirthInfo(personA),
    personB: serializeBasicBirthInfo(personB),
  }
}

export function buildYearlyReadingRequest(
  birthInfo: BirthInfo,
  year: number,
): YearlyReadingRequest {
  return {
    version: READING_CONTRACT_VERSION,
    operation: 'yearly',
    persona: 'scholar',
    birth: serializeFullBirthInfo(birthInfo),
    year,
  }
}

/**
 * Re-applies the operation allowlist at the network boundary. This protects
 * callers written in untyped JavaScript or carrying stale extra properties.
 */
export function serializeReadingRequest(request: ReadingRequest): ReadingRequest {
  switch (request.operation) {
    case 'natal':
      return {
        version: READING_CONTRACT_VERSION,
        operation: 'natal',
        persona: request.persona,
        birth: serializeFullBirthInfo(request.birth),
      }
    case 'compatibility':
      return {
        version: READING_CONTRACT_VERSION,
        operation: 'compatibility',
        persona: request.persona,
        personA: serializeBasicBirthInfo(request.personA),
        personB: serializeBasicBirthInfo(request.personB),
      }
    case 'yearly':
      return {
        version: READING_CONTRACT_VERSION,
        operation: 'yearly',
        persona: request.persona,
        birth: serializeFullBirthInfo(request.birth),
        year: request.year,
      }
  }
}
