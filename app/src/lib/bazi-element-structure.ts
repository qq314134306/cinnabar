import type { BaziElement, BaziPillarScope } from './bazi-four-pillars'

export const BAZI_ELEMENT_ORDER = [
  'Wood',
  'Fire',
  'Earth',
  'Metal',
  'Water',
] as const satisfies readonly BaziElement[]

export interface BaziElementSourcePillar {
  scope: BaziPillarScope
  stem: string
  branch: string
}

export interface BaziElementStructureEntry {
  scope: BaziPillarScope
  source: 'stem' | 'branch'
  character: string
  element: BaziElement
}

export interface BaziElementStructure {
  entries: BaziElementStructureEntry[]
  counts: Record<BaziElement, number>
}

const STEM_ELEMENTS: Record<string, BaziElement> = {
  '甲': 'Wood',
  '乙': 'Wood',
  '丙': 'Fire',
  '丁': 'Fire',
  '戊': 'Earth',
  '己': 'Earth',
  '庚': 'Metal',
  '辛': 'Metal',
  '壬': 'Water',
  '癸': 'Water',
}

const BRANCH_ELEMENTS: Record<string, BaziElement> = {
  '子': 'Water',
  '丑': 'Earth',
  '寅': 'Wood',
  '卯': 'Wood',
  '辰': 'Earth',
  '巳': 'Fire',
  '午': 'Fire',
  '未': 'Earth',
  '申': 'Metal',
  '酉': 'Metal',
  '戌': 'Earth',
  '亥': 'Water',
}

export function buildBaziElementStructure(
  pillars: readonly BaziElementSourcePillar[],
): BaziElementStructure | null {
  const entries = pillars.flatMap((pillar) => {
    const stemElement = STEM_ELEMENTS[pillar.stem]
    const branchElement = BRANCH_ELEMENTS[pillar.branch]
    if (!stemElement || !branchElement) return []

    return [
      {
        scope: pillar.scope,
        source: 'stem' as const,
        character: pillar.stem,
        element: stemElement,
      },
      {
        scope: pillar.scope,
        source: 'branch' as const,
        character: pillar.branch,
        element: branchElement,
      },
    ]
  })

  if (entries.length !== pillars.length * 2) return null

  const counts: Record<BaziElement, number> = {
    Wood: 0,
    Fire: 0,
    Earth: 0,
    Metal: 0,
    Water: 0,
  }
  for (const entry of entries) counts[entry.element] += 1

  return { entries, counts }
}
