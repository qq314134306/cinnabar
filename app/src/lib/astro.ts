/* ============================================================
   iztro chart engine wrapper
   ============================================================

   School conventions (aligned with the Wenmo Tianji standard):
   - Year boundary: Lunar New Year's Day (yearDivide: normal)
   - Horoscope boundary: Lunar New Year's Day (horoscopeDivide: normal)
   - Day change at 23:00, early Zi hour (dayDivide: forward)
   - Minor limit by calendar year (ageDivide: normal)
   - Star placement: Zhong Zhou school (algorithm: zhongzhou)
   ============================================================ */

import { astro } from 'iztro'
import type FunctionalAstrolabe from 'iztro/lib/astro/FunctionalAstrolabe'
import { resolveBirthTime, type ResolvedBirthTime } from './true-solar-time'
export { getShichenOptions, hourToShichen } from './shichen'

/* ------------------------------------------------------------
   Global engine configuration
   ------------------------------------------------------------ */

astro.config({
  yearDivide: 'normal',       // yearly stems/transformations split at Lunar New Year
  horoscopeDivide: 'normal',  // decadal/annual limits split at Lunar New Year
  ageDivide: 'normal',        // minor limit follows the calendar year
  dayDivide: 'forward',       // day rolls over at 23:00 (early Zi hour)
  algorithm: 'zhongzhou',     // Zhong Zhou school star placement
})

export type Gender = 'male' | 'female'

export interface BirthInfo {
  year: number
  month: number
  day: number
  hour: number
  gender: Gender
  birthplace?: string
  trueSolarEnabled?: boolean
  resolvedBirthTime?: ResolvedBirthTime
  /** Approximate times may position a chart but must never be presented as an exact hour pillar. */
  birthTimeReliable?: boolean
  isLeapMonth?: boolean
  fixLeap?: boolean
}

/* ------------------------------------------------------------
   Chart generation
   ------------------------------------------------------------ */

export function generateChart(info: BirthInfo): FunctionalAstrolabe {
  const { gender, fixLeap = true } = info
  const resolvedTime = info.resolvedBirthTime ?? resolveBirthTime({
    year: info.year,
    month: info.month,
    day: info.day,
    hour: info.hour,
    birthplace: info.birthplace,
    enabled: info.trueSolarEnabled ?? true,
  })

  const dateStr = `${resolvedTime.year}-${resolvedTime.month}-${resolvedTime.day}`
  const timeIndex = resolvedTime.timeIndex
  const genderName = gender === 'male' ? '男' : '女'  // iztro accepts zh-CN gender tokens; output language stays zh-CN for internal keys

  return astro.bySolar(dateStr, timeIndex, genderName, fixLeap)
}

/* ------------------------------------------------------------
   Type re-exports
   ------------------------------------------------------------ */

export type { FunctionalAstrolabe }
