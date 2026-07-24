/**
 * Provider-independent structural timing facts for one model year.
 *
 * The engine owns all Major Limit and annual positions. This helper only maps
 * them back onto the natal chart; it does not score or interpret an outcome.
 */

import {
  NATAL_TRANSFORMATION_ORDER,
  type NatalTransformationCode,
} from './chart-transformations'

interface TimingLensStarInput {
  name: string
}

export interface TimingLensPalaceInput {
  name: string
  earthlyBranch?: string
  majorStars?: TimingLensStarInput[]
  minorStars?: TimingLensStarInput[]
  decadal?: {
    range?: [number, number]
  }
}

interface TimingLensPeriodInput {
  heavenlyStem?: string
  earthlyBranch?: string
  palaceNames?: string[]
  mutagen?: string[]
}

export interface TimingLensChartInput {
  palaces: TimingLensPalaceInput[]
  horoscope: (date: Date) => {
    decadal: TimingLensPeriodInput
    yearly: TimingLensPeriodInput
  }
}

export interface TimingLensPalaceReference {
  name: string
  branch: string
}

export interface TimingLensTransformation {
  code: NatalTransformationCode
  starName: string
  hostPalace: TimingLensPalaceReference | null
}

export interface TimingLensPeriod {
  ganZhi: string
  lifePalaceHost: TimingLensPalaceReference | null
  transformations: TimingLensTransformation[]
}

export interface TimingLensSnapshot {
  year: number
  age: number
  majorLimit: TimingLensPeriod & {
    range: [number, number] | null
  }
  annual: TimingLensPeriod
}

function palaceReference(
  palace: TimingLensPalaceInput | undefined,
): TimingLensPalaceReference | null {
  if (!palace) return null
  return {
    name: palace.name,
    branch: palace.earthlyBranch ?? '',
  }
}

function findLifePalaceHost(
  palaces: TimingLensPalaceInput[],
  period: TimingLensPeriodInput,
): TimingLensPalaceReference | null {
  const lifeIndex = period.palaceNames?.indexOf('命宫') ?? -1
  return lifeIndex >= 0
    ? palaceReference(palaces[lifeIndex])
    : null
}

function findStarHost(
  palaces: TimingLensPalaceInput[],
  starName: string,
): TimingLensPalaceReference | null {
  const palace = palaces.find((item) => (
    [...(item.majorStars ?? []), ...(item.minorStars ?? [])]
      .some((star) => star.name === starName)
  ))
  return palaceReference(palace)
}

function collectPeriodTransformations(
  palaces: TimingLensPalaceInput[],
  period: TimingLensPeriodInput,
): TimingLensTransformation[] {
  return NATAL_TRANSFORMATION_ORDER.flatMap((code, index) => {
    const starName = period.mutagen?.[index]
    if (!starName) return []
    return [{
      code,
      starName,
      hostPalace: findStarHost(palaces, starName),
    }]
  })
}

function buildPeriod(
  palaces: TimingLensPalaceInput[],
  period: TimingLensPeriodInput,
): TimingLensPeriod {
  return {
    ganZhi: `${period.heavenlyStem ?? ''}${period.earthlyBranch ?? ''}`,
    lifePalaceHost: findLifePalaceHost(palaces, period),
    transformations: collectPeriodTransformations(palaces, period),
  }
}

export function buildTimingLens(
  chart: TimingLensChartInput,
  birthYear: number,
  year: number,
): TimingLensSnapshot {
  if (!Number.isInteger(birthYear) || !Number.isInteger(year)) {
    throw new RangeError('Timing lens years must be integers.')
  }

  const age = year - birthYear + 1
  if (age < 1) {
    throw new RangeError('Timing lens year cannot be earlier than birth year.')
  }

  // Mid-year matches the existing yearly-facts boundary and avoids selecting
  // a date close to the configured Lunar New Year transition.
  const horoscope = chart.horoscope(new Date(year, 5, 15))
  const rangePalace = chart.palaces.find((palace) => {
    const range = palace.decadal?.range
    return range && age >= range[0] && age <= range[1]
  })

  return {
    year,
    age,
    majorLimit: {
      ...buildPeriod(chart.palaces, horoscope.decadal),
      range: rangePalace?.decadal?.range ?? null,
    },
    annual: buildPeriod(chart.palaces, horoscope.yearly),
  }
}
