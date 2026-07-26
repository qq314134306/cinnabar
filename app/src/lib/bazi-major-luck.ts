/**
 * Deterministic BaZi Major Luck (Da Yun) adapter.
 *
 * This file is loaded on demand so the larger calendar engine does not join
 * the initial chart bundle. Sect 2 preserves the corrected birth minute when
 * converting the distance to the relevant solar term into the start offset.
 */

import { Solar } from 'lunar-typescript'

export interface BaziMajorLuckInput {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  gender: 'male' | 'female'
}

export interface BaziMajorLuckCycle {
  ganZhi: string
  startYear: number
  endYear: number
  startAge: number
  endAge: number
}

export interface BaziMajorLuck {
  direction: 'forward' | 'reverse'
  startAt: string
  startOffset: {
    years: number
    months: number
    days: number
    hours: number
  }
  cycles: BaziMajorLuckCycle[]
}

function isValidInput(input: BaziMajorLuckInput): boolean {
  if (
    !Number.isInteger(input.year)
    || !Number.isInteger(input.month)
    || !Number.isInteger(input.day)
    || !Number.isInteger(input.hour)
    || !Number.isInteger(input.minute)
    || input.hour < 0
    || input.hour > 23
    || input.minute < 0
    || input.minute > 59
  ) return false

  const date = new Date(Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
  ))
  return date.getUTCFullYear() === input.year
    && date.getUTCMonth() === input.month - 1
    && date.getUTCDate() === input.day
    && date.getUTCHours() === input.hour
    && date.getUTCMinutes() === input.minute
}

export function buildBaziMajorLuck(
  input: BaziMajorLuckInput,
): BaziMajorLuck | null {
  if (!isValidInput(input)) return null

  try {
    const lunar = Solar.fromYmdHms(
      input.year,
      input.month,
      input.day,
      input.hour,
      input.minute,
      0,
    ).getLunar()
    const yun = lunar.getEightChar().getYun(
      input.gender === 'male' ? 1 : 0,
      2,
    )
    const cycles = yun.getDaYun(9).slice(1).map((cycle) => ({
      ganZhi: cycle.getGanZhi(),
      startYear: cycle.getStartYear(),
      endYear: cycle.getEndYear(),
      startAge: cycle.getStartAge(),
      endAge: cycle.getEndAge(),
    }))

    if (cycles.length !== 8 || cycles.some((cycle) => !cycle.ganZhi)) {
      return null
    }

    return {
      direction: yun.isForward() ? 'forward' : 'reverse',
      startAt: yun.getStartSolar().toYmdHms(),
      startOffset: {
        years: yun.getStartYear(),
        months: yun.getStartMonth(),
        days: yun.getStartDay(),
        hours: yun.getStartHour(),
      },
      cycles,
    }
  } catch {
    return null
  }
}
