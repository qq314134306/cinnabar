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
export type BaziTenGod =
  | 'dayMaster'
  | 'peer'
  | 'robWealth'
  | 'eatingGod'
  | 'hurtingOfficer'
  | 'indirectWealth'
  | 'directWealth'
  | 'sevenKillings'
  | 'directOfficer'
  | 'indirectResource'
  | 'directResource'

export const BAZI_TEN_GOD_LABELS: Record<BaziTenGod, string> = {
  dayMaster: 'Day Master',
  peer: 'Peer',
  robWealth: 'Rob Wealth',
  eatingGod: 'Eating God',
  hurtingOfficer: 'Hurting Officer',
  indirectWealth: 'Indirect Wealth',
  directWealth: 'Direct Wealth',
  sevenKillings: 'Seven Killings',
  directOfficer: 'Direct Officer',
  indirectResource: 'Indirect Resource',
  directResource: 'Direct Resource',
}

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
  visibleTenGod: BaziTenGod
  hiddenStems: Array<{
    stem: string
    tenGod: BaziTenGod
  }>
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

const GENERATES: Record<BaziElement, BaziElement> = {
  Wood: 'Fire',
  Fire: 'Earth',
  Earth: 'Metal',
  Metal: 'Water',
  Water: 'Wood',
}

const CONTROLS: Record<BaziElement, BaziElement> = {
  Wood: 'Earth',
  Fire: 'Metal',
  Earth: 'Water',
  Metal: 'Wood',
  Water: 'Fire',
}

export const BAZI_HIDDEN_STEMS: Record<string, readonly string[]> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
}

export function getBaziTenGod(
  dayStem: string,
  targetStem: string,
): Exclude<BaziTenGod, 'dayMaster'> | null {
  const day = STEM_PROFILE[dayStem]
  const target = STEM_PROFILE[targetStem]
  if (!day || !target) return null

  const samePolarity = day.polarity === target.polarity
  if (day.element === target.element) {
    return samePolarity ? 'peer' : 'robWealth'
  }
  if (GENERATES[day.element] === target.element) {
    return samePolarity ? 'eatingGod' : 'hurtingOfficer'
  }
  if (GENERATES[target.element] === day.element) {
    return samePolarity ? 'indirectResource' : 'directResource'
  }
  if (CONTROLS[day.element] === target.element) {
    return samePolarity ? 'indirectWealth' : 'directWealth'
  }
  if (CONTROLS[target.element] === day.element) {
    return samePolarity ? 'sevenKillings' : 'directOfficer'
  }

  return null
}

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

    const dayStem = result.daily[0]
    if (!STEM_PROFILE[dayStem]) return null

    const pillars = BAZI_PILLAR_ORDER.flatMap((scope) => {
      const [stem, branch] = result[PILLAR_SOURCE_KEYS[scope]]
      const profile = STEM_PROFILE[stem]
      const visibleTenGod: BaziTenGod | undefined = scope === 'day'
        ? 'dayMaster'
        : getBaziTenGod(dayStem, stem) ?? undefined
      const rawHiddenStems = BAZI_HIDDEN_STEMS[branch]

      if (!profile || !branch || !visibleTenGod || !rawHiddenStems?.length) {
        return []
      }

      const hiddenStems = rawHiddenStems.flatMap((hiddenStem) => {
        const tenGod = getBaziTenGod(dayStem, hiddenStem)
        return tenGod ? [{ stem: hiddenStem, tenGod }] : []
      })
      if (hiddenStems.length !== rawHiddenStems.length) return []

      return [{
        scope,
        stem,
        branch,
        ganZhi: `${stem}${branch}`,
        ...profile,
        visibleTenGod,
        hiddenStems,
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
