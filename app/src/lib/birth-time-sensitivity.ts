/**
 * [INPUT]: A completed chart plus its BirthInfo, explicitly marked approximate.
 * [OUTPUT]: Local structural summaries for the selected wall-clock time and the
 *   immediately adjacent two-hour periods.
 * [POS]: Deterministic uncertainty helper for the natal chart presentation.
 * [PROTOCOL]: Keep date-boundary and true-solar behavior covered by tests. This
 *   helper compares scenarios; it never chooses or mutates the canonical chart.
 */

import {
  generateChart,
  type BirthInfo,
  type FunctionalAstrolabe,
} from './astro'
import {
  createBirthTimeEvidence,
  resolveBirthTime,
  type ResolvedBirthTime,
} from './true-solar-time'

export type BirthTimeScenarioPosition = 'earlier' | 'selected' | 'later'

export interface BirthTimeScenarioSummary {
  position: BirthTimeScenarioPosition
  input: {
    year: number
    month: number
    day: number
    hour: number
  }
  resolved: ResolvedBirthTime
  lifePalace: {
    branch: string
    majorStars: string[]
  } | null
  bodyPalace: {
    branch: string
  } | null
  fiveElementsClass: string
}

export interface BirthTimeSensitivityResult {
  scenarios: BirthTimeScenarioSummary[]
  hasStructuralDifferences: boolean
  suppressedConclusions: string[]
}

interface MinimalStar {
  name: string
}

interface MinimalPalace {
  name: string
  earthlyBranch: string
  majorStars?: MinimalStar[]
  isBodyPalace?: boolean
}

const POSITIONS: Array<{
  position: BirthTimeScenarioPosition
  offsetHours: number
}> = [
  { position: 'earlier', offsetHours: -2 },
  { position: 'selected', offsetHours: 0 },
  { position: 'later', offsetHours: 2 },
]

function shiftedWallClock(
  birthInfo: BirthInfo,
  offsetHours: number,
): BirthTimeScenarioSummary['input'] {
  const date = new Date(Date.UTC(
    birthInfo.year,
    birthInfo.month - 1,
    birthInfo.day,
    birthInfo.hour + offsetHours,
  ))

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
  }
}

function resolveScenario(
  birthInfo: BirthInfo,
  input: BirthTimeScenarioSummary['input'],
): ResolvedBirthTime {
  const knownLocation = birthInfo.resolvedBirthTime?.location ?? null
  const correctionEnabled =
    (birthInfo.trueSolarEnabled ?? true) && knownLocation !== null

  return resolveBirthTime({
    ...input,
    birthplace: knownLocation?.name,
    enabled: correctionEnabled,
    birthplaces: knownLocation ? [knownLocation] : [],
    evidence: createBirthTimeEvidence(
      birthInfo.birthTimeSource ?? birthInfo.resolvedBirthTime?.evidence?.source ?? 'unknown',
      'approximate',
      {
        startHour: (input.hour + 23) % 24,
        endHour: (input.hour + 1) % 24,
        crossesMidnight: input.hour === 0 || input.hour === 23,
      },
    ),
  })
}

function summarizeChart(
  chart: FunctionalAstrolabe,
  position: BirthTimeScenarioPosition,
  input: BirthTimeScenarioSummary['input'],
  resolved: ResolvedBirthTime,
): BirthTimeScenarioSummary {
  const palaces = (chart.palaces ?? []) as unknown as MinimalPalace[]
  const lifePalace = palaces.find((palace) => palace.name === '命宫')
  const bodyPalace = palaces.find((palace) => palace.isBodyPalace === true)

  return {
    position,
    input,
    resolved,
    lifePalace: lifePalace
      ? {
          branch: String(lifePalace.earthlyBranch ?? ''),
          majorStars: (lifePalace.majorStars ?? []).map(
            (star) => String(star.name),
          ),
        }
      : null,
    bodyPalace: bodyPalace
      ? { branch: String(bodyPalace.earthlyBranch ?? '') }
      : null,
    fiveElementsClass: String(chart.fiveElementsClass ?? ''),
  }
}

function scenarioSignature(scenario: BirthTimeScenarioSummary): string {
  return JSON.stringify({
    lifeBranch: scenario.lifePalace?.branch ?? null,
    lifeStars: scenario.lifePalace?.majorStars ?? [],
    bodyBranch: scenario.bodyPalace?.branch ?? null,
    fiveElementsClass: scenario.fiveElementsClass,
  })
}

export function haveStructuralBirthTimeDifferences(
  scenarios: BirthTimeScenarioSummary[],
): boolean {
  return new Set(scenarios.map(scenarioSignature)).size > 1
}

export function buildBirthTimeSensitivity(
  chart: FunctionalAstrolabe,
  birthInfo: BirthInfo,
): BirthTimeSensitivityResult {
  const scenarios = POSITIONS.map(({ position, offsetHours }) => {
    const input = shiftedWallClock(birthInfo, offsetHours)
    const resolved = position === 'selected' && birthInfo.resolvedBirthTime
      ? birthInfo.resolvedBirthTime
      : resolveScenario(birthInfo, input)
    const scenarioChart = position === 'selected'
      ? chart
      : generateChart({
          ...birthInfo,
          ...input,
          resolvedBirthTime: resolved,
        })

    return summarizeChart(
      scenarioChart,
      position,
      input,
      resolved,
    )
  })

  return {
    scenarios,
    hasStructuralDifferences: haveStructuralBirthTimeDifferences(scenarios),
    suppressedConclusions: [
      'Exact Hour Pillar',
      'Exact Zi Wei palace and star placement',
      'Major Luck start timing',
      'Hour-dependent daily timing',
    ],
  }
}
