/**
 * [INPUT]: Depends on a generated FunctionalAstrolabe (lib/astro.ts) and BirthInfo
 * [OUTPUT]: Produces the English "CHART FACTS" text block fed to the AI reading prompts
 * [POS]: Bridges the iztro chart object (kept in zh-CN) and lib/ai-prompts.ts
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { BirthInfo, FunctionalAstrolabe } from './astro'
import { collectNatalTransformations } from './chart-transformations'
import { hourToShichen } from './shichen'
import {
  buildTimingLens,
  type TimingLensChartInput,
} from './timing-lens'
import {
  describeStarLabel,
  PALACE_PINYIN,
  SIHUA_EN,
  translateBranch,
  translateFiveElementsClass,
  translateGanZhi,
  translatePalaceName,
} from './ziwei-glossary'

interface MinimalStar {
  name: string
  mutagen?: string
  brightness?: string
}

interface MinimalPalace {
  name: string
  earthlyBranch: string
  majorStars: MinimalStar[]
  minorStars: MinimalStar[]
  isBodyPalace: boolean
  decadal?: { range: [number, number] }
}

function starList(stars: MinimalStar[]): string {
  if (stars.length === 0) return 'no major stars (borrows influence from the opposite palace)'
  return stars.map((s) => describeStarLabel(s.name)).join(' + ')
}

function palaceHeading(name: string): string {
  const label = translatePalaceName(name)
  const pinyin = PALACE_PINYIN[name]
  return pinyin ? `${label} (${pinyin})` : label
}

function findPalace(palaces: MinimalPalace[], name: string): MinimalPalace | undefined {
  return palaces.find((p) => p.name === name)
}

function findBodyPalace(palaces: MinimalPalace[]): MinimalPalace | undefined {
  return palaces.find((p) => p.isBodyPalace)
}

/** Finds which star carries each of the four transformations, across every palace. */
function findTransformations(palaces: MinimalPalace[]): string {
  return collectNatalTransformations(palaces)
    .map((entry) => {
      const { code } = SIHUA_EN[entry.code]
      return `${code} on ${describeStarLabel(entry.starName)} (in the ${translatePalaceName(entry.palaceName)})`
    })
    .join(', ')
}

/** Finds the palace whose Da Xian (decadal) range covers the given age. */
function findCurrentDecadal(palaces: MinimalPalace[], age: number) {
  return palaces.find((p) => {
    const range = p.decadal?.range
    return range && age >= range[0] && age <= range[1]
  })
}

export interface ChartFactsOptions {
  /** Optional label prepended to the block, e.g. "PERSON A" for compatibility readings. */
  label?: string
}

export function buildZiWeiChartFacts(
  chart: FunctionalAstrolabe,
  birthInfo: BirthInfo,
  options: ChartFactsOptions = {}
): string {
  const palaces = chart.palaces as unknown as MinimalPalace[]
  const lifePalace = findPalace(palaces, '命宫')
  const bodyPalace = findBodyPalace(palaces)
  const careerPalace = findPalace(palaces, '官禄')
  const wealthPalace = findPalace(palaces, '财帛')
  const spousePalace = findPalace(palaces, '夫妻')
  const travelPalace = findPalace(palaces, '迁移')

  const currentYear = new Date().getFullYear()
  const currentAge = Math.max(1, currentYear - birthInfo.year + 1)
  const currentDecadal = findCurrentDecadal(palaces, currentAge)

  const lines: string[] = []
  if (options.label) lines.push(`${options.label}`)
  lines.push('System: Zi Wei Dou Shu (Purple Star Astrology)')
  if (birthInfo.birthTimeReliable !== true) {
    lines.push('Birth Time Reliability: approximate; time-specific pillar omitted')
  } else {
    const chartHour = birthInfo.resolvedBirthTime?.hour ?? birthInfo.hour
    const correctionLabel = birthInfo.resolvedBirthTime?.applied
      ? ' after true solar correction'
      : ''
    lines.push(`Birth Hour${correctionLabel}: ${hourToShichen(chartHour)}`)
  }

  if (lifePalace) {
    lines.push(
      `Life Palace (${palaceHeading('命宫')}): in ${translateBranch(lifePalace.earthlyBranch)} — main stars: ${starList(lifePalace.majorStars)}`
    )
  }
  if (bodyPalace) {
    lines.push(
      `Body Palace (${palaceHeading('身宫')}): in ${translateBranch(bodyPalace.earthlyBranch)} — ${starList(bodyPalace.majorStars)}`
    )
  }
  if (careerPalace) {
    lines.push(`Career Palace (${palaceHeading('官禄')}): ${starList(careerPalace.majorStars)}`)
  }
  if (wealthPalace) {
    lines.push(`Wealth Palace (${palaceHeading('财帛')}): ${starList(wealthPalace.majorStars)}`)
  }
  if (spousePalace) {
    lines.push(`Spouse Palace (${palaceHeading('夫妻')}): ${starList(spousePalace.majorStars)}`)
  }
  if (travelPalace) {
    lines.push(`Travel/Opportunity Palace (${palaceHeading('迁移')}): ${starList(travelPalace.majorStars)}`)
  }

  const transformations = findTransformations(palaces)
  if (transformations) {
    lines.push(`Four Transformations (Si Hua): ${transformations}`)
  }

  lines.push(`Five Elements Class: ${translateFiveElementsClass(chart.fiveElementsClass)}`)

  if (currentDecadal?.decadal) {
    const [start, end] = currentDecadal.decadal.range
    lines.push(
      `Current Major Limit (Da Xian, ages ${start}-${end}): passing through the ${translatePalaceName(currentDecadal.name)}`
    )
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------
   Year-by-year facts (Liu Nian) for the paid Future Report
   ------------------------------------------------------------ */

/**
 * Builds one line per requested year: the year's Four Transformations mapped
 * onto natal palaces, and which natal palace hosts this year's Life Palace —
 * all computed by the engine (`chart.horoscope`), never invented.
 */
export function buildYearlyChartFacts(
  chart: FunctionalAstrolabe,
  birthInfo: BirthInfo,
  years: number[]
): string {
  const lines: string[] = ['Year-by-Year Timing (Liu Nian):']

  for (const year of years) {
    const lens = buildTimingLens(
      chart as unknown as TimingLensChartInput,
      birthInfo.year,
      year,
    )
    const ganzhi = translateGanZhi(lens.annual.ganZhi)

    const transformationLines = lens.annual.transformations
      .map((transformation) => {
        const { code } = SIHUA_EN[transformation.code]
        return transformation.hostPalace
          ? `${code} on ${describeStarLabel(transformation.starName)} (natal ${translatePalaceName(transformation.hostPalace.name)})`
          : `${code} on ${describeStarLabel(transformation.starName)}`
      })
      .join(', ')

    const lifeHostLine = lens.annual.lifePalaceHost
      ? ` This year's Life Palace falls on your natal ${translatePalaceName(lens.annual.lifePalaceHost.name)}.`
      : ''

    lines.push(`- ${year} (age ${lens.age}, ${ganzhi} year): ${transformationLines}.${lifeHostLine}`)
  }

  return lines.join('\n')
}
