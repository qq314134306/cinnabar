/**
 * [INPUT]: Depends on a generated FunctionalAstrolabe (lib/astro.ts) and BirthInfo
 * [OUTPUT]: Produces the English "CHART FACTS" text block fed to the AI reading prompts
 * [POS]: Bridges the iztro chart object (kept in zh-CN) and lib/ai-prompts.ts
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { BirthInfo, FunctionalAstrolabe } from './astro'
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
  const found: Partial<Record<string, { star: string; palace: string }>> = {}

  for (const palace of palaces) {
    for (const star of [...palace.majorStars, ...palace.minorStars]) {
      if (star.mutagen && SIHUA_EN[star.mutagen] && !found[star.mutagen]) {
        found[star.mutagen] = { star: star.name, palace: palace.name }
      }
    }
  }

  const order = ['禄', '权', '科', '忌']
  return order
    .filter((m) => found[m])
    .map((m) => {
      const entry = found[m]!
      const { code } = SIHUA_EN[m]
      return `${code} on ${describeStarLabel(entry.star)} (in the ${translatePalaceName(entry.palace)})`
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

const SIHUA_ORDER = ['禄', '权', '科', '忌']

interface MinimalHoroscopeYearly {
  heavenlyStem: string
  earthlyBranch: string
  /** Star names carrying this year's transformations, in Lu/Quan/Ke/Ji order. */
  mutagen: string[]
  /** Parallel to `chart.palaces` — this year's palace label at that natal position. */
  palaceNames: string[]
}

function findNatalPalaceForStar(palaces: MinimalPalace[], starName: string): MinimalPalace | undefined {
  return palaces.find((p) => [...p.majorStars, ...p.minorStars].some((s) => s.name === starName))
}

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
  const palaces = chart.palaces as unknown as MinimalPalace[]
  const lines: string[] = ['Year-by-Year Timing (Liu Nian):']

  for (const year of years) {
    const age = year - birthInfo.year + 1
    const horoscope = chart.horoscope(new Date(year, 5, 15)) as unknown as { yearly: MinimalHoroscopeYearly }
    const yearly = horoscope.yearly
    const ganzhi = translateGanZhi(`${yearly.heavenlyStem}${yearly.earthlyBranch}`)

    const transformationLines = SIHUA_ORDER
      .map((code, i) => {
        const starName = yearly.mutagen[i]
        if (!starName) return null
        const hostPalace = findNatalPalaceForStar(palaces, starName)
        const { code: sihuaCode } = SIHUA_EN[code]
        return hostPalace
          ? `${sihuaCode} on ${describeStarLabel(starName)} (natal ${translatePalaceName(hostPalace.name)})`
          : `${sihuaCode} on ${describeStarLabel(starName)}`
      })
      .filter((line): line is string => !!line)
      .join(', ')

    const lifeIdx = yearly.palaceNames.indexOf('命宫')
    const lifeHostPalace = lifeIdx >= 0 ? palaces[lifeIdx] : undefined
    const lifeHostLine = lifeHostPalace
      ? ` This year's Life Palace falls on your natal ${translatePalaceName(lifeHostPalace.name)}.`
      : ''

    lines.push(`- ${year} (age ${age}, ${ganzhi} year): ${transformationLines}.${lifeHostLine}`)
  }

  return lines.join('\n')
}
