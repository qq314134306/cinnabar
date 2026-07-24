/**
 * Deterministic BaZi Four Pillars adapter.
 *
 * lunar-lite owns the solar-term and stem/branch calculation. This module
 * validates the corrected birth date/time block, requests BaZi-specific
 * Li Chun and solar-term boundaries, and normalizes the four pillars for UI.
 */

import { getHeavenlyStemAndEarthlyBranchBySolarDate } from 'lunar-lite'

export const BAZI_PILLAR_ORDER = ['year', 'month', 'day', 'hour'] as const

export type BaziPillarScope = (typeof BAZI_PILLAR_ORDER)[number]
export type BaziElement = 'Wood' | 'Fire' | 'Earth' | 'Metal' | 'Water'
export type BaziPolarity = 'Yang' | 'Yin'

export interface BaziPillarCalculationInput {
  year: number
  month: number
  day: number
  timeIndex: number
}

export interface BaziPillar {
  scope: BaziPillarScope
  stem: string
  branch: string
  ganZhi: string
  element: BaziElement
  polarity: BaziPolarity
}

export interface BaziFourPillars {
  pillars: BaziPillar[]
  dayMaster: {
    stem: string
    element: BaziElement
    polarity: BaziPolarity
  }
}

const STEM_PROFILE: Record<
  string,
  { element: BaziElement; polarity: BaziPolarity }
> = {
  '甲': { element: 'Wood', polarity: 'Yang' },
  '乙': { element: 'Wood', polarity: 'Yin' },
  '丙': { element: 'Fire', polarity: 'Yang' },
  '丁': { element: 'Fire', polarity: 'Yin' },
  '戊': { element: 'Earth', polarity: 'Yang' },
  '己': { element: 'Earth', polarity: 'Yin' },
  '庚': { element: 'Metal', polarity: 'Yang' },
  '辛': { element: 'Metal', polarity: 'Yin' },
  '壬': { element: 'Water', polarity: 'Yang' },
  '癸': { element: 'Water', polarity: 'Yin' },
}

const PILLAR_SOURCE_KEYS = {
  year: 'yearly',
  month: 'monthly',
  day: 'daily',
  hour: 'hourly',
} as const

function isValidDate(input: BaziPillarCalculationInput): boolean {
  if (
    !Number.isInteger(input.year)
    || !Number.isInteger(input.month)
    || !Number.isInteger(input.day)
    || !Number.isInteger(input.timeIndex)
    || input.timeIndex < 0
    || input.timeIndex > 12
  ) {
    return false
  }

  const date = new Date(Date.UTC(input.year, input.month - 1, input.day))
  return (
    date.getUTCFullYear() === input.year
    && date.getUTCMonth() === input.month - 1
    && date.getUTCDate() === input.day
  )
}

export function buildBaziFourPillars(
  input: BaziPillarCalculationInput,
): BaziFourPillars | null {
  if (!isValidDate(input)) return null

  try {
    const result = getHeavenlyStemAndEarthlyBranchBySolarDate(
      `${input.year}-${input.month}-${input.day}`,
      input.timeIndex,
      {
        year: 'exact',
        month: 'exact',
      },
    )

    const pillars = BAZI_PILLAR_ORDER.flatMap((scope) => {
      const [stem, branch] = result[PILLAR_SOURCE_KEYS[scope]]
      const profile = STEM_PROFILE[stem]
      if (!profile || !branch) return []

      return [{
        scope,
        stem,
        branch,
        ganZhi: `${stem}${branch}`,
        ...profile,
      }]
    })

    if (pillars.length !== BAZI_PILLAR_ORDER.length) return null
    const dayPillar = pillars.find((pillar) => pillar.scope === 'day')
    if (!dayPillar) return null

    return {
      pillars,
      dayMaster: {
        stem: dayPillar.stem,
        element: dayPillar.element,
        polarity: dayPillar.polarity,
      },
    }
  } catch {
    return null
  }
}
