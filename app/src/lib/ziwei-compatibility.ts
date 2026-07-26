import { generateChart, type BirthInfo } from './astro'
import {
  collectNatalTransformations,
} from './chart-transformations'
import { getSanFangSiZheng } from './palace-relations'

const KEY_PALACES = ['命宫', '夫妻', '福德', '迁移', '官禄', '财帛'] as const
const FOCUS_PALACES = ['命宫', '夫妻'] as const

type KeyPalaceName = (typeof KEY_PALACES)[number]

interface ZiweiPalace {
  name: string
  earthlyBranch: string
  majorStars: Array<{ name: string; mutagen?: unknown; brightness?: string }>
  minorStars: Array<{ name: string; mutagen?: unknown; brightness?: string }>
}

export interface ZiweiChartEvidence {
  label: 'Person A' | 'Person B'
  solarDate: string
  reliableTime: boolean
  lifePalaceBranch?: string
  lifePalaceStars: string[]
}

export interface ZiweiPalaceOverlay {
  direction: 'A→B' | 'B→A'
  sourcePalace: KeyPalaceName
  branch: string
  receivingPalace: string
}

export interface ZiweiCrossTransformation {
  direction: 'A→B' | 'B→A'
  code: '禄' | '权' | '科' | '忌'
  starName: string
  sourcePalace: string
  branch: string
  receivingPalace: string
}

export interface ZiweiSanFangInteraction {
  direction: 'A→B' | 'B→A'
  focusPalace: '命宫' | '夫妻'
  focusBranch: string
  receivingPalaces: Array<{
    role: 'focus' | 'trine' | 'opposite'
    branch: string
    palaceName: string
  }>
}

export interface ZiweiCompatibilityResult {
  charts: [ZiweiChartEvidence, ZiweiChartEvidence]
  uncertainty: {
    suppressed: boolean
    reason?: string
  }
  palaceOverlays: ZiweiPalaceOverlay[]
  crossTransformations: ZiweiCrossTransformation[]
  sanFangInteractions: ZiweiSanFangInteraction[]
}

function palacesFor(info: BirthInfo): ZiweiPalace[] {
  return generateChart(info).palaces as unknown as ZiweiPalace[]
}

function chartEvidence(
  label: ZiweiChartEvidence['label'],
  info: BirthInfo,
  palaces: ZiweiPalace[],
): ZiweiChartEvidence {
  const life = palaces.find((palace) => palace.name === '命宫')
  const resolved = info.resolvedBirthTime
  return {
    label,
    solarDate: resolved
      ? `${resolved.year}-${resolved.month}-${resolved.day}`
      : `${info.year}-${info.month}-${info.day}`,
    reliableTime: info.birthTimeReliable === true,
    ...(info.birthTimeReliable === true && life
      ? { lifePalaceBranch: life.earthlyBranch }
      : {}),
    lifePalaceStars: info.birthTimeReliable === true
      ? (life?.majorStars ?? []).map((star) => star.name)
      : [],
  }
}

function palaceAt(palaces: ZiweiPalace[], branch: string): ZiweiPalace | undefined {
  return palaces.find((palace) => palace.earthlyBranch === branch)
}

function overlays(
  direction: ZiweiPalaceOverlay['direction'],
  source: ZiweiPalace[],
  receiver: ZiweiPalace[],
): ZiweiPalaceOverlay[] {
  return KEY_PALACES.flatMap((name) => {
    const sourcePalace = source.find((palace) => palace.name === name)
    const receivingPalace = sourcePalace
      ? palaceAt(receiver, sourcePalace.earthlyBranch)
      : undefined
    return sourcePalace && receivingPalace
      ? [{
          direction,
          sourcePalace: name,
          branch: sourcePalace.earthlyBranch,
          receivingPalace: receivingPalace.name,
        }]
      : []
  })
}

function transformations(
  direction: ZiweiCrossTransformation['direction'],
  source: ZiweiPalace[],
  receiver: ZiweiPalace[],
): ZiweiCrossTransformation[] {
  return collectNatalTransformations(source).flatMap((item) => {
    const receivingPalace = palaceAt(receiver, item.palaceBranch)
    return receivingPalace
      ? [{
          direction,
          code: item.code,
          starName: item.starName,
          sourcePalace: item.palaceName,
          branch: item.palaceBranch,
          receivingPalace: receivingPalace.name,
        }]
      : []
  })
}

function sanFang(
  direction: ZiweiSanFangInteraction['direction'],
  source: ZiweiPalace[],
  receiver: ZiweiPalace[],
): ZiweiSanFangInteraction[] {
  return FOCUS_PALACES.flatMap((focusPalace) => {
    const focus = source.find((palace) => palace.name === focusPalace)
    if (!focus) return []
    const receivingPalaces = getSanFangSiZheng(focus.earthlyBranch).flatMap((relation) => {
      const palace = palaceAt(receiver, relation.branch)
      return palace ? [{ ...relation, palaceName: palace.name }] : []
    })
    return [{
      direction,
      focusPalace,
      focusBranch: focus.earthlyBranch,
      receivingPalaces,
    }]
  })
}

/**
 * Builds two independent Zi Wei natal charts, then indexes inspectable
 * cross-chart structure. BirthInfo's resolvedBirthTime is the only timestamp
 * authority. Zi Wei never supplies or overwrites BaZi Four Pillars.
 */
export function buildZiweiCompatibility(
  personA: BirthInfo,
  personB: BirthInfo,
): ZiweiCompatibilityResult {
  const palacesA = palacesFor(personA)
  const palacesB = palacesFor(personB)
  const charts: ZiweiCompatibilityResult['charts'] = [
    chartEvidence('Person A', personA, palacesA),
    chartEvidence('Person B', personB, palacesB),
  ]
  const suppressed = charts.some((chart) => !chart.reliableTime)

  if (suppressed) {
    return {
      charts,
      uncertainty: {
        suppressed: true,
        reason: 'Birth time is approximate for at least one person. Hour-dependent palace, transformation, and San Fang Si Zheng conclusions are withheld.',
      },
      palaceOverlays: [],
      crossTransformations: [],
      sanFangInteractions: [],
    }
  }

  return {
    charts,
    uncertainty: { suppressed: false },
    palaceOverlays: [
      ...overlays('A→B', palacesA, palacesB),
      ...overlays('B→A', palacesB, palacesA),
    ],
    crossTransformations: [
      ...transformations('A→B', palacesA, palacesB),
      ...transformations('B→A', palacesB, palacesA),
    ],
    sanFangInteractions: [
      ...sanFang('A→B', palacesA, palacesB),
      ...sanFang('B→A', palacesB, palacesA),
    ],
  }
}
