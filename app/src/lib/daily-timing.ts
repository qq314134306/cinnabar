import {
  BAZI_TEN_GOD_LABELS,
  buildBaziFourPillars,
  getBaziTenGod,
  type BaziTenGod,
} from './bazi-four-pillars'

type DailyTenGod = Exclude<BaziTenGod, 'dayMaster'>

export interface DailyTimingCalculationInput {
  birth: {
    year: number
    month: number
    day: number
    timeIndex: number
  }
  selectedDate: {
    year: number
    month: number
    day: number
  }
}

export interface DailyTimingResult {
  natalDayMaster: {
    stem: string
    element: string
    polarity: string
  }
  selectedDate: {
    year: number
    month: number
    day: number
  }
  dayPillar: {
    stem: string
    branch: string
    ganZhi: string
    element: string
    polarity: string
  }
  relationship: DailyTenGod
  relationshipLabel: string
  relationshipDescription: string
}

export const DAILY_TIMING_DESCRIPTIONS: Record<DailyTenGod, string> = {
  peer: 'The selected day shares the Day Master’s element and polarity.',
  robWealth: 'The selected day shares the Day Master’s element with opposite polarity.',
  eatingGod: 'The Day Master generates the selected day with matching polarity.',
  hurtingOfficer: 'The Day Master generates the selected day with opposite polarity.',
  indirectWealth: 'The Day Master controls the selected day with matching polarity.',
  directWealth: 'The Day Master controls the selected day with opposite polarity.',
  sevenKillings: 'The selected day controls the Day Master with matching polarity.',
  directOfficer: 'The selected day controls the Day Master with opposite polarity.',
  indirectResource: 'The selected day generates the Day Master with matching polarity.',
  directResource: 'The selected day generates the Day Master with opposite polarity.',
}

export function buildDailyTiming(
  input: DailyTimingCalculationInput,
): DailyTimingResult | null {
  const natal = buildBaziFourPillars(input.birth)
  const selected = buildBaziFourPillars({
    ...input.selectedDate,
    // The day pillar is date-bound. Noon keeps the calculation clear of a
    // library's Zi-hour rollover behavior without claiming an hour reading.
    timeIndex: 6,
  })
  if (!natal || !selected) return null

  const dayPillar = selected.pillars.find((pillar) => pillar.scope === 'day')
  if (!dayPillar) return null

  const relationship = getBaziTenGod(
    natal.dayMaster.stem,
    dayPillar.stem,
  )
  if (!relationship) return null

  return {
    natalDayMaster: natal.dayMaster,
    selectedDate: input.selectedDate,
    dayPillar: {
      stem: dayPillar.stem,
      branch: dayPillar.branch,
      ganZhi: dayPillar.ganZhi,
      element: dayPillar.element,
      polarity: dayPillar.polarity,
    },
    relationship,
    relationshipLabel: BAZI_TEN_GOD_LABELS[relationship],
    relationshipDescription: DAILY_TIMING_DESCRIPTIONS[relationship],
  }
}
