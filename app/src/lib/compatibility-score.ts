import { generateChart, type BirthInfo } from './astro'
import { calculatePeriodScore } from './fortune-score'
import { deriveSoulCard, identityLine } from './soul-card'
import {
  buildBaziCompatibility,
  type BaziCompatibilityResult,
} from './bazi-compatibility'

export type CompatibilityDimensionKey =
  | 'communication'
  | 'sharedDirection'
  | 'emotionalRhythm'
  | 'resilience'

export interface CompatibilityDimension {
  key: CompatibilityDimensionKey
  label: string
  score: number
  summary: string
}

export interface CompatibilityPerson {
  identity: string
  element: string
  keywords: string[]
}

export interface LocalCompatibilityResult {
  year: number
  overall: number
  label: string
  personA: CompatibilityPerson
  personB: CompatibilityPerson
  dimensions: CompatibilityDimension[]
  strongestSignal: string
  growthEdge: string
  elementStory: string
  bazi: BaziCompatibilityResult | null
}

const SUPPORTIVE_ELEMENT_PAIRS = new Set([
  'Wood|Fire',
  'Fire|Earth',
  'Earth|Metal',
  'Metal|Water',
  'Water|Wood',
])

const TENSION_ELEMENT_PAIRS = new Set([
  'Wood|Earth',
  'Earth|Water',
  'Water|Fire',
  'Fire|Metal',
  'Metal|Wood',
])

function clamp(value: number, minimum = 25, maximum = 98): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}

function closeness(first: number, second: number): number {
  return clamp(100 - Math.abs(first - second) * 1.15)
}

function unorderedPair(first: string, second: string): string[] {
  return [`${first}|${second}`, `${second}|${first}`]
}

function elementContext(first: string, second: string): {
  modifier: number
  story: string
} {
  if (first === 'Star' || second === 'Star') {
    return {
      modifier: 0,
      story: 'One chart has a neutral element signature, so the model relies more on the four score dimensions.',
    }
  }

  if (first === second) {
    return {
      modifier: 4,
      story: `Both charts carry a ${first} emphasis, suggesting a familiar pace and shared instincts.`,
    }
  }

  const pair = unorderedPair(first, second)
  if (pair.some((value) => SUPPORTIVE_ELEMENT_PAIRS.has(value))) {
    return {
      modifier: 6,
      story: `${first} and ${second} form a supportive element sequence in the model, favoring complementary roles.`,
    }
  }

  if (pair.some((value) => TENSION_ELEMENT_PAIRS.has(value))) {
    return {
      modifier: -3,
      story: `${first} and ${second} create productive friction in the model; clear expectations matter more than assumed agreement.`,
    }
  }

  return {
    modifier: 0,
    story: `${first} and ${second} bring distinct lenses without a strong element bonus or penalty.`,
  }
}

function dimensionSummary(label: string, score: number): string {
  if (score >= 82) {
    return `${label} is a naturally aligned area; use it as the relationship's stabilizing strength.`
  }
  if (score >= 68) {
    return `${label} has solid potential when both people make their expectations visible.`
  }
  return `${label} benefits from slower conversations, explicit boundaries, and fewer assumptions.`
}

function overallLabel(score: number): string {
  if (score >= 84) return 'Strong alignment'
  if (score >= 72) return 'Good potential'
  if (score >= 58) return 'Mixed but workable'
  return 'Needs intentional effort'
}

function toPerson(chart: ReturnType<typeof generateChart>): CompatibilityPerson {
  const soul = deriveSoulCard(chart)
  return {
    identity: identityLine(soul),
    element: soul.element.name,
    keywords: soul.keywords,
  }
}

export function compareBirthCharts(
  personA: BirthInfo,
  personB: BirthInfo,
  year = new Date().getFullYear(),
): LocalCompatibilityResult {
  const chartA = generateChart(personA)
  const chartB = generateChart(personB)
  const scoreA = calculatePeriodScore(chartA, year)
  const scoreB = calculatePeriodScore(chartB, year)
  const personASummary = toPerson(chartA)
  const personBSummary = toPerson(chartB)
  const elements = elementContext(personASummary.element, personBSummary.element)

  const rawDimensions: Array<{
    key: CompatibilityDimensionKey
    label: string
    score: number
  }> = [
    {
      key: 'communication',
      label: 'Communication',
      score: (
        closeness(scoreA.dimensions.relationship, scoreB.dimensions.relationship) * 0.5
        + closeness(scoreA.dimensions.career, scoreB.dimensions.career) * 0.2
        + closeness(scoreA.total, scoreB.total) * 0.3
        + elements.modifier
      ),
    },
    {
      key: 'sharedDirection',
      label: 'Shared direction',
      score: (
        closeness(scoreA.dimensions.career, scoreB.dimensions.career) * 0.45
        + closeness(scoreA.dimensions.wealth, scoreB.dimensions.wealth) * 0.35
        + closeness(scoreA.total, scoreB.total) * 0.2
        + elements.modifier * 0.5
      ),
    },
    {
      key: 'emotionalRhythm',
      label: 'Emotional rhythm',
      score: (
        closeness(scoreA.dimensions.relationship, scoreB.dimensions.relationship) * 0.65
        + closeness(scoreA.dimensions.health, scoreB.dimensions.health) * 0.35
        + elements.modifier
      ),
    },
    {
      key: 'resilience',
      label: 'Resilience',
      score: (
        closeness(scoreA.dimensions.health, scoreB.dimensions.health) * 0.55
        + closeness(scoreA.total, scoreB.total) * 0.25
        + closeness(scoreA.dimensions.wealth, scoreB.dimensions.wealth) * 0.2
        + elements.modifier * 0.5
      ),
    },
  ]

  const dimensions = rawDimensions.map((dimension) => {
    const score = clamp(dimension.score)
    return {
      ...dimension,
      score,
      summary: dimensionSummary(dimension.label, score),
    }
  })
  const overall = clamp(
    dimensions.reduce((total, dimension) => total + dimension.score, 0)
      / dimensions.length,
  )
  const ordered = [...dimensions].sort((first, second) => second.score - first.score)
  const strongest = ordered[0]
  const growth = ordered[ordered.length - 1]

  return {
    year,
    overall,
    label: overallLabel(overall),
    personA: personASummary,
    personB: personBSummary,
    dimensions,
    strongestSignal: `${strongest.label} is the clearest shared rhythm at ${strongest.score}/100.`,
    growthEdge: growth.score >= 82
      ? 'The model shows no pronounced mismatch; keep checking assumptions as circumstances change.'
      : `${growth.label} is the main area to handle deliberately at ${growth.score}/100.`,
    elementStory: elements.story,
    bazi: buildBaziCompatibility(personA, personB),
  }
}
