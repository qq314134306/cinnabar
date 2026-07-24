/**
 * [INPUT]: Approximate user-authoritative birth fields, an exact local
 *          birthplace, optional rough recall, and answers to past-event
 *          questions.
 * [OUTPUT]: Thirteen independently solar-resolved civil-time candidates,
 *           equivalent chart groups, deterministic questions, and a visible
 *           evidence-point ranking.
 * [POS]: Provider-independent birth-time shortlist engine.
 * [PROTOCOL]: This module compares consistency with a local heuristic model.
 *             It never claims an exact time, probability, or validated
 *             prediction. Keep all scoring deterministic and test every
 *             candidate/date boundary.
 */

import {
  generateChart,
  type BirthInfo,
  type FunctionalAstrolabe,
} from './astro'
import {
  findBirthplaceAsync,
  isExactBirthplaceMatch,
  resolveBirthTime,
  type Birthplace,
  type ResolvedBirthTime,
} from './true-solar-time'

export type RecallDaypart = 'overnight' | 'morning' | 'daytime' | 'evening'
export type RecallSource = 'written' | 'family' | 'impression' | 'none'
export type EventAnswer = 'yes' | 'no' | 'uncertain' | 'skip'
export type EventSignal = -1 | 0 | 1
export type EventDomain =
  | 'relocation'
  | 'education'
  | 'work'
  | 'leadership'
  | 'partnership'
  | 'home'

export interface CivilTimeBlock {
  id: string
  label: string
  range: string
  hour: number
  daypart: RecallDaypart
}

export interface BirthTimeCandidate {
  id: string
  block: CivilTimeBlock
  input: {
    year: number
    month: number
    day: number
    hour: number
  }
  birthInfo: BirthInfo
  resolved: ResolvedBirthTime
  chart: FunctionalAstrolabe
  groupKey: string
}

export interface BirthTimeCandidateGroup {
  key: string
  candidates: BirthTimeCandidate[]
  chart: FunctionalAstrolabe
}

export interface BirthTimeQuestion {
  id: string
  domain: EventDomain
  startYear: number
  endYear: number
  prompt: string
  signals: Record<string, EventSignal>
  discrimination: number
}

export interface RecallEvidence {
  dayparts: RecallDaypart[]
  source: RecallSource
}

export interface EvidenceLine {
  id: string
  points: number
  text: string
}

export interface RankedCandidateGroup {
  group: BirthTimeCandidateGroup
  score: number
  evidence: EvidenceLine[]
}

export interface BirthTimeRanking {
  ranked: RankedCandidateGroup[]
  scoredAnswerCount: number
  scoredDomains: EventDomain[]
  leaderMargin: number
  noClearSeparation: boolean
}

export class BirthTimeFinderInputError extends Error {}

export const CIVIL_TIME_BLOCKS: CivilTimeBlock[] = [
  {
    id: 'early-rat',
    label: 'Early Rat Hour',
    range: '00:00–00:59',
    hour: 0,
    daypart: 'overnight',
  },
  {
    id: 'ox',
    label: 'Ox Hour',
    range: '01:00–02:59',
    hour: 2,
    daypart: 'overnight',
  },
  {
    id: 'tiger',
    label: 'Tiger Hour',
    range: '03:00–04:59',
    hour: 4,
    daypart: 'overnight',
  },
  {
    id: 'rabbit',
    label: 'Rabbit Hour',
    range: '05:00–06:59',
    hour: 6,
    daypart: 'morning',
  },
  {
    id: 'dragon',
    label: 'Dragon Hour',
    range: '07:00–08:59',
    hour: 8,
    daypart: 'morning',
  },
  {
    id: 'snake',
    label: 'Snake Hour',
    range: '09:00–10:59',
    hour: 10,
    daypart: 'morning',
  },
  {
    id: 'horse',
    label: 'Horse Hour',
    range: '11:00–12:59',
    hour: 12,
    daypart: 'daytime',
  },
  {
    id: 'goat',
    label: 'Goat Hour',
    range: '13:00–14:59',
    hour: 14,
    daypart: 'daytime',
  },
  {
    id: 'monkey',
    label: 'Monkey Hour',
    range: '15:00–16:59',
    hour: 16,
    daypart: 'daytime',
  },
  {
    id: 'rooster',
    label: 'Rooster Hour',
    range: '17:00–18:59',
    hour: 18,
    daypart: 'evening',
  },
  {
    id: 'dog',
    label: 'Dog Hour',
    range: '19:00–20:59',
    hour: 20,
    daypart: 'evening',
  },
  {
    id: 'pig',
    label: 'Pig Hour',
    range: '21:00–22:59',
    hour: 22,
    daypart: 'evening',
  },
  {
    id: 'late-rat',
    label: 'Late Rat Hour',
    range: '23:00–23:59',
    hour: 23,
    daypart: 'overnight',
  },
]

const DOMAIN_PALACES: Record<EventDomain, string[]> = {
  relocation: ['迁移', '命宫'],
  education: ['官禄', '父母', '命宫'],
  work: ['官禄', '迁移', '命宫'],
  leadership: ['官禄', '命宫', '仆役'],
  partnership: ['夫妻', '福德'],
  home: ['田宅', '财帛', '福德'],
}

const DOMAIN_COPY: Record<EventDomain, (start: number, end: number) => string> = {
  relocation: (start, end) => (
    `Between ${start} and ${end}, did you move city or country, or live away from your usual home for at least six months?`
  ),
  education: (start, end) => (
    `Between ${start} and ${end}, did you begin, finish, or substantially change a course of study or training?`
  ),
  work: (start, end) => (
    `Between ${start} and ${end}, did you start, leave, or substantially change your main work direction?`
  ),
  leadership: (start, end) => (
    `Between ${start} and ${end}, did you take responsibility for a team, organization, or major project?`
  ),
  partnership: (start, end) => (
    `Between ${start} and ${end}, did a long-term partnership begin, end, or materially change?`
  ),
  home: (start, end) => (
    `Between ${start} and ${end}, did you take on or end a major long-term home, business, or financial responsibility?`
  ),
}

const DOMAIN_ORDER: EventDomain[] = [
  'relocation',
  'education',
  'work',
  'leadership',
  'partnership',
  'home',
]

interface MinimalStar {
  name: string
}

interface MinimalPalace {
  name: string
  majorStars: MinimalStar[]
  minorStars: MinimalStar[]
  decadal?: {
    range?: [number, number]
  }
}

interface MinimalYearly {
  palaceNames: string[]
  mutagen: string[]
}

interface CandidateYearFacts {
  annualLifeHostPalace: string | null
  decadalHostPalace: string | null
  transformationHostPalaces: string[]
}

function groupKey(resolved: ResolvedBirthTime): string {
  return [
    resolved.year,
    resolved.month,
    resolved.day,
    resolved.timeIndex,
  ].join('-')
}

async function requireExactBirthplace(query: string): Promise<Birthplace> {
  const location = await findBirthplaceAsync(query)
  if (!location || !isExactBirthplaceMatch(query, location)) {
    throw new BirthTimeFinderInputError(
      'Birthplace could not be matched exactly. Enter a recognized city before comparing time blocks.',
    )
  }
  return location
}

export async function buildBirthTimeCandidates(
  birthInfo: BirthInfo,
  birthplaceText: string,
  shouldContinue: () => boolean = () => true,
): Promise<BirthTimeCandidate[]> {
  const birthplace = birthplaceText.trim()
  if (!birthplace) {
    throw new BirthTimeFinderInputError(
      'Enter the local birthplace before comparing time blocks.',
    )
  }
  const location = await requireExactBirthplace(birthplace)

  const candidates: BirthTimeCandidate[] = []
  for (const [index, block] of CIVIL_TIME_BLOCKS.entries()) {
    if (!shouldContinue()) return []
    if (index > 0 && index % 3 === 0) {
      await yieldToMainThread()
      if (!shouldContinue()) return []
    }
    const input = {
      year: birthInfo.year,
      month: birthInfo.month,
      day: birthInfo.day,
      hour: block.hour,
    }
    const resolved = resolveBirthTime({
      ...input,
      birthplace,
      enabled: true,
      birthplaces: [location],
    })
    const candidateBirthInfo: BirthInfo = {
      ...birthInfo,
      ...input,
      birthplace,
      trueSolarEnabled: true,
      resolvedBirthTime: resolved,
      birthTimeReliable: false,
    }

    candidates.push({
      id: block.id,
      block,
      input,
      birthInfo: candidateBirthInfo,
      resolved,
      chart: generateChart(candidateBirthInfo),
      groupKey: groupKey(resolved),
    })
  }
  return candidates
}

export function groupEquivalentCandidates(
  candidates: BirthTimeCandidate[],
): BirthTimeCandidateGroup[] {
  const groups = new Map<string, BirthTimeCandidateGroup>()
  for (const candidate of candidates) {
    const existing = groups.get(candidate.groupKey)
    if (existing) {
      existing.candidates.push(candidate)
    } else {
      groups.set(candidate.groupKey, {
        key: candidate.groupKey,
        candidates: [candidate],
        chart: candidate.chart,
      })
    }
  }
  return [...groups.values()]
}

function findStarHost(
  palaces: MinimalPalace[],
  starName: string,
): string | null {
  const palace = palaces.find((candidate) => (
    [...candidate.majorStars, ...candidate.minorStars]
      .some((star) => star.name === starName)
  ))
  return palace?.name ?? null
}

function buildYearFacts(
  group: BirthTimeCandidateGroup,
  birthYear: number,
  year: number,
): CandidateYearFacts {
  const palaces = group.chart.palaces as unknown as MinimalPalace[]
  const horoscope = group.chart.horoscope(
    new Date(Date.UTC(year, 5, 15)),
  ) as unknown as { yearly: MinimalYearly }
  const yearly = horoscope.yearly
  const annualLifeIndex = yearly.palaceNames.indexOf('命宫')
  const age = year - birthYear + 1
  const decadal = palaces.find((palace) => {
    const range = palace.decadal?.range
    return Boolean(range && age >= range[0] && age <= range[1])
  })
  const transformationHostPalaces = yearly.mutagen
    .map((starName) => findStarHost(palaces, String(starName)))
    .filter((name): name is string => Boolean(name))

  return {
    annualLifeHostPalace: annualLifeIndex >= 0
      ? palaces[annualLifeIndex]?.name ?? null
      : null,
    decadalHostPalace: decadal?.name ?? null,
    transformationHostPalaces,
  }
}

function activationForFacts(
  facts: CandidateYearFacts,
  domain: EventDomain,
): number {
  const targetPalaces = DOMAIN_PALACES[domain]
  let score = 0
  if (
    facts.annualLifeHostPalace
    && targetPalaces.includes(facts.annualLifeHostPalace)
  ) score += 2
  if (
    facts.decadalHostPalace
    && targetPalaces.includes(facts.decadalHostPalace)
  ) score += 1
  if (
    facts.transformationHostPalaces
      .some((palace) => targetPalaces.includes(palace))
  ) score += 1
  return score
}

function signalVector(
  rawByGroup: Record<string, number>,
): {
  signals: Record<string, EventSignal>
  discrimination: number
} {
  const values = Object.values(rawByGroup)
  const distinct = [...new Set(values)].sort((left, right) => left - right)
  if (distinct.length < 2 || values.length < 2) {
    return {
      signals: Object.fromEntries(
        Object.keys(rawByGroup).map((key) => [key, 0]),
      ),
      discrimination: 0,
    }
  }

  const rankSize = Math.max(1, Math.ceil(values.length * 0.3))
  const ascending = [...values].sort((left, right) => left - right)
  const lowCutoff = ascending[Math.min(rankSize - 1, ascending.length - 1)]
  const highCutoff = ascending[Math.max(0, ascending.length - rankSize)]
  if (lowCutoff === highCutoff) {
    return {
      signals: Object.fromEntries(
        Object.keys(rawByGroup).map((key) => [key, 0]),
      ),
      discrimination: 0,
    }
  }

  const signals = Object.fromEntries(
    Object.entries(rawByGroup).map(([key, value]) => [
      key,
      value >= highCutoff ? 1 : value <= lowCutoff ? -1 : 0,
    ]),
  ) as Record<string, EventSignal>
  const nonNeutral = Object.values(signals).filter((value) => value !== 0).length

  return {
    signals,
    discrimination:
      (Math.max(...values) - Math.min(...values)) * 100
      + distinct.length * 10
      + nonNeutral,
  }
}

function candidateWindows(
  birthYear: number,
  currentYear: number,
): Array<{ startYear: number; endYear: number }> {
  const latestPastAge = currentYear - birthYear
  if (latestPastAge < 20) return []
  const firstStartAge = 18
  const lastStartAge = latestPastAge - 2
  const startAges = new Set<number>()
  for (let index = 0; index < 4; index += 1) {
    startAges.add(Math.round(
      firstStartAge
      + ((lastStartAge - firstStartAge) * index) / 3,
    ))
  }
  return [...startAges].sort((left, right) => left - right).map((startAge) => ({
    startYear: birthYear + startAge - 1,
    endYear: birthYear + startAge + 1,
  }))
}

type YearFactsReader = (
  group: BirthTimeCandidateGroup,
  year: number,
) => CandidateYearFacts | null

function selectBirthTimeQuestions(
  groups: BirthTimeCandidateGroup[],
  birthYear: number,
  currentYear: number,
  maxQuestions: number,
  factsFor: YearFactsReader,
): BirthTimeQuestion[] {
  const windows = candidateWindows(birthYear, currentYear)
  if (groups.length < 2 || windows.length === 0) return []

  const bestByDomain = DOMAIN_ORDER
    .map((domain): BirthTimeQuestion | null => {
      let best: BirthTimeQuestion | null = null
      for (const window of windows) {
        // One stable midpoint probe keeps this local interaction responsive.
        // The UI discloses that the result has annual, not minute-level,
        // resolution and is only a consistency heuristic.
        const probeYear = window.startYear + 1
        const rawByGroup = Object.fromEntries(groups.map((group) => {
          const facts = factsFor(group, probeYear)
          const raw = facts ? activationForFacts(facts, domain) : 0
          return [group.key, raw]
        }))
        const { signals, discrimination } = signalVector(rawByGroup)
        if (discrimination === 0) continue
        const question: BirthTimeQuestion = {
          id: `${domain}-${window.startYear}-${window.endYear}`,
          domain,
          startYear: window.startYear,
          endYear: window.endYear,
          prompt: DOMAIN_COPY[domain](window.startYear, window.endYear),
          signals,
          discrimination,
        }
        if (
          !best
          || question.discrimination > best.discrimination
          || (
            question.discrimination === best.discrimination
            && question.endYear > best.endYear
          )
        ) {
          best = question
        }
      }
      return best
    })
    .filter((question): question is BirthTimeQuestion => Boolean(question))

  return bestByDomain
    .sort((left, right) => (
      right.discrimination - left.discrimination
      || DOMAIN_ORDER.indexOf(left.domain) - DOMAIN_ORDER.indexOf(right.domain)
    ))
    .slice(0, maxQuestions)
}

export function buildBirthTimeQuestions(
  groups: BirthTimeCandidateGroup[],
  birthYear: number,
  currentYear: number,
  maxQuestions = 5,
): BirthTimeQuestion[] {
  const yearFacts = new Map<string, CandidateYearFacts | null>()
  const factsFor: YearFactsReader = (group, year) => {
    const key = `${group.key}:${year}`
    if (yearFacts.has(key)) return yearFacts.get(key) ?? null
    try {
      const facts = buildYearFacts(group, birthYear, year)
      yearFacts.set(key, facts)
      return facts
    } catch {
      yearFacts.set(key, null)
      return null
    }
  }
  return selectBirthTimeQuestions(
    groups,
    birthYear,
    currentYear,
    maxQuestions,
    factsFor,
  )
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0))
}

export async function buildBirthTimeQuestionsAsync(
  groups: BirthTimeCandidateGroup[],
  birthYear: number,
  currentYear: number,
  maxQuestions = 5,
  shouldContinue: () => boolean = () => true,
): Promise<BirthTimeQuestion[]> {
  const windows = candidateWindows(birthYear, currentYear)
  if (groups.length < 2 || windows.length === 0) return []

  const probeYears = [...new Set(
    windows.map((window) => window.startYear + 1),
  )]
  const yearFacts = new Map<string, CandidateYearFacts | null>()
  let workCount = 0
  for (const group of groups) {
    for (const year of probeYears) {
      if (!shouldContinue()) return []
      if (workCount > 0 && workCount % 4 === 0) {
        await yieldToMainThread()
        if (!shouldContinue()) return []
      }
      const key = `${group.key}:${year}`
      try {
        yearFacts.set(key, buildYearFacts(group, birthYear, year))
      } catch {
        yearFacts.set(key, null)
      }
      workCount += 1
    }
  }

  return selectBirthTimeQuestions(
    groups,
    birthYear,
    currentYear,
    maxQuestions,
    (group, year) => yearFacts.get(`${group.key}:${year}`) ?? null,
  )
}

function recallWeight(source: RecallSource): number {
  if (source === 'written') return 2
  if (source === 'family' || source === 'impression') return 1
  return 0
}

function signedPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points)
}

function recallLabel(source: RecallSource): string {
  if (source === 'written') return 'Written record'
  if (source === 'family') return 'Family recollection'
  return 'Rough impression'
}

export function scoreBirthTimeGroups(
  groups: BirthTimeCandidateGroup[],
  questions: BirthTimeQuestion[],
  answers: Record<string, EventAnswer>,
  recall: RecallEvidence,
): BirthTimeRanking {
  const answeredQuestions = questions.filter((question) => (
    answers[question.id] === 'yes' || answers[question.id] === 'no'
  ))
  const scoredDomains = [...new Set(
    answeredQuestions.map((question) => question.domain),
  )]
  const priorWeight = recallWeight(recall.source)

  const ranked = groups.map((group): RankedCandidateGroup => {
    const evidence: EvidenceLine[] = []
    let score = 0
    if (priorWeight > 0 && recall.dayparts.length > 0) {
      const matches = group.candidates.some((candidate) => (
        recall.dayparts.includes(candidate.block.daypart)
      ))
      const points = matches ? priorWeight : -priorWeight
      score += points
      evidence.push({
        id: 'rough-recall',
        points,
        text: `${recallLabel(recall.source)} ${matches ? 'includes' : 'does not include'} this civil-time group (${signedPoints(points)}).`,
      })
    }

    for (const question of answeredQuestions) {
      const answer = answers[question.id]
      const signal = question.signals[group.key] ?? 0
      const points = answer === 'yes' ? signal * 2 : signal * -1
      if (points === 0) continue
      score += points
      evidence.push({
        id: question.id,
        points,
        text: `${answer === 'yes' ? 'Remembered event' : 'No remembered event'} · ${question.startYear}–${question.endYear} (${signedPoints(points)}).`,
      })
    }

    return { group, score, evidence }
  }).sort((left, right) => (
    right.score - left.score || left.group.key.localeCompare(right.group.key)
  ))

  const leaderMargin = ranked.length > 1
    ? ranked[0].score - ranked[1].score
    : 0
  const noClearSeparation = (
    answeredQuestions.length < 3
    || scoredDomains.length < 3
    || ranked.length < 2
    || leaderMargin < 2
  )

  return {
    ranked,
    scoredAnswerCount: answeredQuestions.length,
    scoredDomains,
    leaderMargin,
    noClearSeparation,
  }
}

export function shouldStopBirthTimeQuestions(
  ranking: BirthTimeRanking,
): boolean {
  return (
    ranking.scoredAnswerCount >= 3
    && ranking.scoredDomains.length >= 3
    && ranking.leaderMargin >= 4
  )
}
