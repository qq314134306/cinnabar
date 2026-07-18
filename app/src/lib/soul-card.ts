/**
 * [INPUT]: A generated FunctionalAstrolabe (lib/astro.ts) — the chart already cast for
 *   the user; nothing here is invented, only read + translated.
 * [OUTPUT]: SoulCardData — the core identity, element theme, keywords, and a hooky
 *   (non-report) teaser used to render the shareable Soul Card.
 * [POS]: Presentation helper between the iztro chart (zh-CN) and SoulCard.tsx.
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { FunctionalAstrolabe } from './astro'
import { MAJOR_STAR_EN, translateFiveElementsClass } from './ziwei-glossary'

export type ElementKey = 'water' | 'wood' | 'metal' | 'earth' | 'fire'

export interface ElementTheme {
  key: ElementKey
  label: string
  /** Accent color (hardcoded hex — html2canvas cannot resolve CSS vars). */
  accent: string
  accentSoft: string
  /** Background gradient stops for the card. */
  bgFrom: string
  bgTo: string
}

/* ------------------------------------------------------------
   Element themes — Eastern-mystic palette, aligned with the site.
   Night-indigo base kept for brand consistency; accent shifts by element.
   ------------------------------------------------------------ */

const ELEMENT_THEMES: Record<ElementKey, ElementTheme> = {
  water: { key: 'water', label: 'Water', accent: '#5b8dd6', accentSoft: 'rgba(91,141,214,0.55)', bgFrom: '#0e1730', bgTo: '#101a3a' },
  wood: { key: 'wood', label: 'Wood', accent: '#4fae82', accentSoft: 'rgba(79,174,130,0.55)', bgFrom: '#0f1f24', bgTo: '#122a2a' },
  metal: { key: 'metal', label: 'Metal', accent: '#C9A24B', accentSoft: 'rgba(201,162,75,0.55)', bgFrom: '#16162b', bgTo: '#1d1b2f' },
  earth: { key: 'earth', label: 'Earth', accent: '#c08a4e', accentSoft: 'rgba(192,138,78,0.55)', bgFrom: '#1c1626', bgTo: '#231a24' },
  fire: { key: 'fire', label: 'Fire', accent: '#c65142', accentSoft: 'rgba(198,81,66,0.55)', bgFrom: '#1e1230', bgTo: '#2a1330' },
}

function elementFromClass(fiveElementsClass?: string): ElementKey {
  if (!fiveElementsClass) return 'metal'
  if (fiveElementsClass.startsWith('水')) return 'water'
  if (fiveElementsClass.startsWith('木')) return 'wood'
  if (fiveElementsClass.startsWith('金')) return 'metal'
  if (fiveElementsClass.startsWith('土')) return 'earth'
  if (fiveElementsClass.startsWith('火')) return 'fire'
  return 'metal'
}

/* ------------------------------------------------------------
   Personality keywords per major star (self-discovery framing only).
   Two to three evocative traits — grounded in each star's classic
   temperament, never a prediction.
   ------------------------------------------------------------ */

const STAR_KEYWORDS: Record<string, string[]> = {
  '紫微': ['Dignified', 'Composed', 'Natural leader'],
  '天机': ['Quick-minded', 'Strategic', 'Curious'],
  '太阳': ['Warm', 'Generous', 'Radiant'],
  '武曲': ['Decisive', 'Resilient', 'Grounded'],
  '天同': ['Gentle', 'Optimistic', 'Easygoing'],
  '廉贞': ['Intense', 'Magnetic', 'Principled'],
  '天府': ['Steady', 'Nurturing', 'Abundant'],
  '太阴': ['Intuitive', 'Tender', 'Reflective'],
  '贪狼': ['Charismatic', 'Versatile', 'Passionate'],
  '巨门': ['Perceptive', 'Articulate', 'Discerning'],
  '天相': ['Loyal', 'Fair-minded', 'Poised'],
  '天梁': ['Wise', 'Protective', 'Principled'],
  '七杀': ['Bold', 'Independent', 'Driven'],
  '破军': ['Pioneering', 'Fearless', 'Transformative'],
}

/* ------------------------------------------------------------
   Locked teaser — a hooky self-discovery prompt, NOT the paid report.
   Deterministic per core star so it feels tailored without inventing
   any future forecast.
   ------------------------------------------------------------ */

interface Teaser {
  title: string
  body: string
}

const HIDDEN_STRENGTH: Record<string, string> = {
  '紫微': 'a quiet authority people follow before you say a word',
  '天机': 'a mind that sees the pattern three moves before everyone else',
  '太阳': 'a warmth that lifts a room without you trying',
  '武曲': 'a spine of steel that shows up exactly when it matters',
  '天同': 'a softness that heals the people around you',
  '廉贞': 'a magnetism that turns intensity into influence',
  '天府': 'a steadiness others quietly build their lives around',
  '太阴': 'an intuition that reads what no one says out loud',
  '贪狼': 'a charm that opens doors most people never find',
  '巨门': 'a voice that names the truth others are afraid to',
  '天相': 'a fairness people trust with the things that matter most',
  '天梁': 'a wisdom that makes you the one others come to',
  '七杀': 'a nerve to walk paths most people won’t risk',
  '破军': 'a courage to rebuild what others would only patch',
}

function buildTeaser(coreStarCn: string): Teaser {
  const strength = HIDDEN_STRENGTH[coreStarCn]
  if (strength) {
    return {
      title: 'Your Hidden Strength',
      body: `Your chart points to ${strength} — a side of you that rarely gets the credit it deserves.`,
    }
  }
  return {
    title: 'Your Hidden Strength',
    body: 'Your chart holds a quiet strength you rarely give yourself credit for.',
  }
}

/* ------------------------------------------------------------
   Public shape
   ------------------------------------------------------------ */

export interface SoulCardData {
  coreStarCn: string
  coreStarPinyin: string
  coreStarArchetype: string
  element: ElementTheme
  keywords: string[]
  teaser: Teaser
  /** True when the Life Palace has no major star and we read its opposite palace. */
  borrowed: boolean
}

interface MinimalStar {
  name: string
}
interface MinimalPalace {
  name: string
  majorStars?: MinimalStar[]
}

/** Picks the primary Life Palace star, borrowing from the opposite palace if empty. */
function pickCoreStar(chart: FunctionalAstrolabe): { name: string; borrowed: boolean } | null {
  const palaces = chart.palaces as unknown as MinimalPalace[]
  const life = palaces.find((p) => p.name === '命宫')
  const lifeStar = life?.majorStars?.[0]?.name
  if (lifeStar) return { name: lifeStar, borrowed: false }

  // Empty Life Palace borrows influence from the opposite (Travel) palace.
  const travel = palaces.find((p) => p.name === '迁移')
  const travelStar = travel?.majorStars?.[0]?.name
  if (travelStar) return { name: travelStar, borrowed: true }

  return null
}

export function buildSoulCardData(chart: FunctionalAstrolabe): SoulCardData | null {
  const core = pickCoreStar(chart)
  if (!core) return null

  const gloss = MAJOR_STAR_EN[core.name]
  if (!gloss) return null

  const element = ELEMENT_THEMES[elementFromClass(chart.fiveElementsClass)]
  const keywords = (STAR_KEYWORDS[core.name] ?? ['Unique', 'Layered']).slice(0, 3)

  return {
    coreStarCn: core.name,
    coreStarPinyin: gloss.pinyin,
    coreStarArchetype: gloss.archetype,
    element,
    keywords,
    teaser: buildTeaser(core.name),
    borrowed: core.borrowed,
  }
}

/** Convenience for the raw English element label (e.g. for chart facts parity). */
export function elementLabel(fiveElementsClass?: string): string {
  return translateFiveElementsClass(fiveElementsClass)
}
