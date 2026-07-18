/**
 * [INPUT]: A generated FunctionalAstrolabe (chart store) — Life Palace stars + Five Elements class
 * [OUTPUT]: Deterministic Soul Card data: core identity, element accent, keywords, teaser
 * [POS]: Pure derivation layer between the chart store and SoulCard.tsx
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * Everything here is a fixed lookup keyed off the user's ALREADY-COMPUTED chart
 * (Life Palace main stars + Five Elements class). Nothing is invented per user
 * and no AI text is used — the same chart always yields the same card.
 */

import type { FunctionalAstrolabe } from './astro'
import { MAJOR_STAR_EN } from './ziwei-glossary'

export interface ElementAccent {
  /** English element name, e.g. "Fire". */
  name: string
  /** Primary accent color (on-brand). */
  color: string
  /** Softer tint used for glows/borders. */
  soft: string
}

export interface SoulCardData {
  /** One entry per Life Palace main star (may be empty for a borrowing palace). */
  identity: Array<{ pinyin: string; archetype: string }>
  element: ElementAccent
  /** 2–3 personality keywords. */
  keywords: string[]
  /** A short, evocative "hidden strength" line — the unlock reward (NOT the paid report). */
  hiddenStrength: string
}

/* ------------------------------------------------------------
   Five Elements → on-brand accent colors
   ------------------------------------------------------------ */

const ELEMENT_BY_ZH: Record<string, ElementAccent> = {
  '水': { name: 'Water', color: '#5B7CB8', soft: 'rgba(91, 124, 184, 0.28)' },
  '木': { name: 'Wood', color: '#6F9E6E', soft: 'rgba(111, 158, 110, 0.28)' },
  '火': { name: 'Fire', color: '#B23A2E', soft: 'rgba(178, 58, 46, 0.30)' },
  '土': { name: 'Earth', color: '#C9A24B', soft: 'rgba(201, 162, 75, 0.30)' },
  '金': { name: 'Metal', color: '#B8B2C4', soft: 'rgba(184, 178, 196, 0.28)' },
}

const DEFAULT_ELEMENT: ElementAccent = {
  name: 'Star',
  color: '#C9A24B',
  soft: 'rgba(201, 162, 75, 0.30)',
}

function elementFromClass(fiveElementsClass?: string): ElementAccent {
  if (!fiveElementsClass) return DEFAULT_ELEMENT
  const zh = fiveElementsClass.charAt(0)
  return ELEMENT_BY_ZH[zh] ?? DEFAULT_ELEMENT
}

/* ------------------------------------------------------------
   Major star → curated keywords + hidden-strength teaser.
   Wording tracks the glossary archetypes (self-discovery voice only).
   ------------------------------------------------------------ */

const STAR_KEYWORDS: Record<string, string[]> = {
  '紫微': ['Dignified', 'Commanding', 'Principled'],
  '天机': ['Analytical', 'Adaptive', 'Curious'],
  '太阳': ['Generous', 'Radiant', 'Driven'],
  '武曲': ['Decisive', 'Disciplined', 'Resolute'],
  '天同': ['Gentle', 'Optimistic', 'Easygoing'],
  '廉贞': ['Intense', 'Magnetic', 'Complex'],
  '天府': ['Steady', 'Prudent', 'Reassuring'],
  '太阴': ['Intuitive', 'Nurturing', 'Reflective'],
  '贪狼': ['Charismatic', 'Versatile', 'Adventurous'],
  '巨门': ['Probing', 'Persuasive', 'Candid'],
  '天相': ['Loyal', 'Fair-minded', 'Supportive'],
  '天梁': ['Protective', 'Wise', 'Steadfast'],
  '七杀': ['Bold', 'Independent', 'Pioneering'],
  '破军': ['Daring', 'Transformative', 'All-or-nothing'],
}

const STAR_HIDDEN_STRENGTH: Record<string, string> = {
  '紫微': 'You steady a room without trying — people look to you the moment things wobble.',
  '天机': 'You see the pattern three moves early, long before anyone names it out loud.',
  '太阳': 'Your warmth is a resource others quietly run on, even when you feel dimmed.',
  '武曲': 'You turn resolve into results — once you decide, the outcome is half-built.',
  '天同': 'You make ease look effortless, and that softness is a strength others envy.',
  '廉贞': 'Your intensity, aimed well, becomes the kind of focus most people never reach.',
  '天府': 'You are the safe pair of hands — abundance gathers where you tend it.',
  '太阴': 'You read the room beneath the room; your intuition is rarely wrong.',
  '贪狼': 'You can befriend anyone and try anything — range is your quiet superpower.',
  '巨门': 'The question you dare to ask is the one that changes the whole conversation.',
  '天相': 'You are the trusted right hand — things simply work better when you are near.',
  '天梁': 'You protect what matters, and people feel safer the moment you arrive.',
  '七杀': 'You move first while others hesitate — courage is your default setting.',
  '破军': 'You are built to rebuild — endings, in your hands, become clean beginnings.',
}

const ELEMENT_KEYWORDS: Record<string, string[]> = {
  Water: ['Intuitive', 'Adaptable', 'Deep'],
  Wood: ['Growing', 'Visionary', 'Kind'],
  Fire: ['Expressive', 'Warm', 'Magnetic'],
  Earth: ['Grounded', 'Loyal', 'Patient'],
  Metal: ['Precise', 'Resolute', 'Refined'],
  Star: ['Singular', 'Reflective', 'Becoming'],
}

/* ------------------------------------------------------------
   Derivation
   ------------------------------------------------------------ */

interface MinimalStar {
  name: string
}
interface MinimalPalace {
  name: string
  majorStars?: MinimalStar[]
}

function lifePalaceMajorStars(chart: FunctionalAstrolabe): string[] {
  const palaces = (chart.palaces ?? []) as unknown as MinimalPalace[]
  const life = palaces.find((p) => p.name === '命宫')
  return (life?.majorStars ?? []).map((s) => String(s.name))
}

export function deriveSoulCard(chart: FunctionalAstrolabe): SoulCardData {
  const element = elementFromClass(chart.fiveElementsClass as string | undefined)
  const zhStars = lifePalaceMajorStars(chart)

  const identity = zhStars
    .map((zh) => MAJOR_STAR_EN[zh])
    .filter((g): g is { pinyin: string; archetype: string } => !!g)
    .map((g) => ({ pinyin: g.pinyin, archetype: g.archetype }))

  // Keywords: from the (first) main star, else from the element.
  const primaryStar = zhStars.find((zh) => STAR_KEYWORDS[zh])
  const keywords = primaryStar
    ? STAR_KEYWORDS[primaryStar]
    : ELEMENT_KEYWORDS[element.name] ?? ELEMENT_KEYWORDS.Star

  const hiddenStrength = primaryStar
    ? STAR_HIDDEN_STRENGTH[primaryStar]
    : 'Your strength is quiet and self-made — it shows up most when no one is watching.'

  return { identity, element, keywords, hiddenStrength }
}

/** "A"/"An" for an element name (only "Earth" takes "An"). */
export function elementArticle(elementName: string): string {
  return /^[AEIOU]/i.test(elementName) ? 'An' : 'A'
}

/** Compact identity line, e.g. "Zi Wei · the Emperor" or "A Water soul". */
export function identityLine(data: SoulCardData): string {
  if (data.identity.length > 0) {
    return data.identity.map((i) => `${i.pinyin} · ${i.archetype}`).join('  +  ')
  }
  return `${elementArticle(data.element.name)} ${data.element.name} soul`
}
