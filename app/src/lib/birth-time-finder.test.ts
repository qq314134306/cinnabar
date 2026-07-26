import { describe, expect, it } from 'vitest'
import type { FunctionalAstrolabe } from './astro'
import {
  analyzeBirthTimeRankingRobustness,
  BirthTimeFinderInputError,
  CIVIL_TIME_BLOCKS,
  buildBirthTimeCandidates,
  buildBirthTimeQuestions,
  buildBirthTimeQuestionsAsync,
  groupEquivalentCandidates,
  scoreBirthTimeGroups,
  shouldStopBirthTimeQuestions,
  type BirthTimeCandidate,
  type BirthTimeCandidateGroup,
  type BirthTimeQuestion,
} from './birth-time-finder'

const APPROXIMATE_BIRTH = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male' as const,
  birthplace: 'Chengdu',
  trueSolarEnabled: false,
  birthTimeReliable: false,
}

describe('birth-time candidate preparation', () => {
  it('builds exactly thirteen independently solar-resolved civil candidates', async () => {
    const candidates = await buildBirthTimeCandidates(
      APPROXIMATE_BIRTH,
      'Chengdu',
    )

    expect(candidates).toHaveLength(13)
    expect(candidates.map((candidate) => candidate.block.id)).toEqual(
      CIVIL_TIME_BLOCKS.map((block) => block.id),
    )
    expect(candidates[0]).toMatchObject({
      id: 'early-rat',
      input: { year: 1990, month: 1, day: 1, hour: 0 },
      birthInfo: {
        birthplace: 'Chengdu',
        trueSolarEnabled: true,
        birthTimeReliable: false,
        birthTimeUnknown: false,
      },
      resolved: {
        applied: true,
        crossedDate: true,
        year: 1989,
        month: 12,
        day: 31,
        evidence: {
          source: 'unknown',
          sourceReliability: 'unknown',
          uncertainty: 'approximate',
          candidateRange: { startHour: 0, endHour: 1, crossesMidnight: false },
        },
      },
    })
    expect(candidates[12]).toMatchObject({
      id: 'late-rat',
      input: { year: 1990, month: 1, day: 1, hour: 23 },
      birthInfo: {
        trueSolarEnabled: true,
        birthTimeReliable: false,
      },
      resolved: {
        evidence: {
          candidateRange: { startHour: 23, endHour: 0, crossesMidnight: true },
        },
      },
    })
    expect(candidates.every((candidate) => (
      candidate.resolved.location?.enName === 'Chengdu'
    ))).toBe(true)
  })

  it('rejects a prefix-only place before generating candidates', async () => {
    await expect(buildBirthTimeCandidates(
      APPROXIMATE_BIRTH,
      'New Y',
    )).rejects.toBeInstanceOf(BirthTimeFinderInputError)
  })

  it('keeps late-Rat date crossing and DST corrections candidate-specific', async () => {
    const yearEnd = await buildBirthTimeCandidates(
      {
        ...APPROXIMATE_BIRTH,
        month: 11,
        day: 1,
      },
      'Fuyuan',
    )
    expect(yearEnd.find((candidate) => candidate.id === 'late-rat')).toMatchObject({
      resolved: {
        crossedDate: true,
        year: 1990,
        month: 11,
        day: 2,
      },
    })

    const summer = await buildBirthTimeCandidates(
      {
        ...APPROXIMATE_BIRTH,
        month: 7,
        day: 15,
      },
      'New York',
    )
    const winter = await buildBirthTimeCandidates(
      {
        ...APPROXIMATE_BIRTH,
        month: 1,
        day: 15,
      },
      'New York',
    )
    const summerNoon = summer.find((candidate) => candidate.block.hour === 12)
    const winterNoon = winter.find((candidate) => candidate.block.hour === 12)

    expect(summerNoon?.resolved.correctionMinutes).toBeLessThan(-50)
    expect(Math.abs(winterNoon?.resolved.correctionMinutes ?? 999)).toBeLessThan(20)
    expect(summerNoon?.groupKey).not.toBe(winterNoon?.groupKey)
  })

  it('groups civil candidates that resolve to the same chart input', async () => {
    const candidates = await buildBirthTimeCandidates(
      APPROXIMATE_BIRTH,
      'Chengdu',
    )
    const duplicate = {
      ...candidates[0],
      id: 'duplicate',
      block: { ...candidates[0].block, id: 'duplicate' },
    }

    const groups = groupEquivalentCandidates([...candidates, duplicate])
    const duplicateGroup = groups.find((group) => (
      group.key === candidates[0].groupKey
    ))

    expect(duplicateGroup?.candidates.map((candidate) => candidate.id)).toEqual([
      'early-rat',
      'duplicate',
    ])
  })
})

describe('birth-time event evidence', () => {
  it('selects at most five deterministic adult historical questions', async () => {
    const candidates = await buildBirthTimeCandidates(
      APPROXIMATE_BIRTH,
      'Chengdu',
    )
    const groups = groupEquivalentCandidates(candidates)

    const first = buildBirthTimeQuestions(groups, 1990, 2026)
    const second = await buildBirthTimeQuestionsAsync(groups, 1990, 2026)

    expect(first.length).toBeGreaterThanOrEqual(3)
    expect(first).toHaveLength(5)
    expect(first.map((question) => question.id)).toEqual(
      second.map((question) => question.id),
    )
    expect(new Set(first.map((question) => question.domain)).size).toBe(
      first.length,
    )
    expect(first.every((question) => (
      question.startYear >= 2007
      && question.endYear < 2026
      && Object.values(question.signals).every(
        (signal) => signal === -1 || signal === 0 || signal === 1,
      )
    ))).toBe(true)
  }, 15_000)

  it('cooperatively cancels annual-fact preparation between batches', async () => {
    const groups = [
      mockGroup('a', 'morning'),
      mockGroup('b', 'evening'),
      mockGroup('c', 'overnight'),
      mockGroup('d', 'daytime'),
      mockGroup('e', 'morning'),
    ]
    let keepGoing = true
    globalThis.setTimeout(() => {
      keepGoing = false
    }, 0)

    await expect(buildBirthTimeQuestionsAsync(
      groups,
      1990,
      2026,
      5,
      () => keepGoing,
    )).resolves.toEqual([])
  })

  it('scores visible evidence deterministically and keeps no/unsure weaker', () => {
    const groups = [
      mockGroup('a', 'morning'),
      mockGroup('b', 'evening'),
      mockGroup('c', 'overnight'),
    ]
    const questions: BirthTimeQuestion[] = [
      mockQuestion('work-1', 'work', { a: 1, b: 0, c: -1 }),
      mockQuestion('home-1', 'home', { a: 1, b: -1, c: 0 }),
      mockQuestion('move-1', 'relocation', { a: 1, b: -1, c: 0 }),
    ]

    const yesRanking = scoreBirthTimeGroups(
      groups,
      questions,
      {
        'work-1': 'yes',
        'home-1': 'no',
        'move-1': 'uncertain',
      },
      { source: 'family', dayparts: ['morning'] },
    )
    const repeated = scoreBirthTimeGroups(
      groups,
      questions,
      {
        'work-1': 'yes',
        'home-1': 'no',
        'move-1': 'uncertain',
      },
      { source: 'family', dayparts: ['morning'] },
    )

    expect(yesRanking.ranked.map(({ group, score }) => ({
      key: group.key,
      score,
    }))).toEqual(repeated.ranked.map(({ group, score }) => ({
      key: group.key,
      score,
    })))
    expect(yesRanking.ranked[0]).toMatchObject({
      group: { key: 'a' },
      score: 2,
    })
    expect(yesRanking.ranked[0].evidence.map((line) => line.points)).toEqual([
      1,
      2,
      -1,
    ])
    expect(yesRanking.scoredAnswerCount).toBe(2)
    expect(yesRanking.scoredDomains).toEqual(['work', 'home'])
  })

  it('stops early only with three scored domains and a clear margin', () => {
    const groups = [
      mockGroup('a', 'morning'),
      mockGroup('b', 'evening'),
      mockGroup('c', 'overnight'),
    ]
    const questions: BirthTimeQuestion[] = [
      mockQuestion('work-1', 'work', { a: 1, b: -1, c: -1 }),
      mockQuestion('home-1', 'home', { a: 1, b: -1, c: -1 }),
      mockQuestion('move-1', 'relocation', { a: 1, b: -1, c: -1 }),
    ]
    const ranking = scoreBirthTimeGroups(
      groups,
      questions,
      {
        'work-1': 'yes',
        'home-1': 'yes',
        'move-1': 'yes',
      },
      { source: 'none', dayparts: [] },
    )

    expect(ranking.leaderMargin).toBe(12)
    expect(shouldStopBirthTimeQuestions(ranking)).toBe(true)
    expect(shouldStopBirthTimeQuestions({
      ...ranking,
      scoredAnswerCount: 2,
    })).toBe(false)
  })

  it('reports when the leader survives removal of any one scored answer', () => {
    const groups = [
      mockGroup('a', 'morning'),
      mockGroup('b', 'evening'),
      mockGroup('c', 'overnight'),
    ]
    const questions = [
      mockQuestion('work-1', 'work', { a: 1, b: -1, c: 0 }),
      mockQuestion('home-1', 'home', { a: 1, b: -1, c: 0 }),
      mockQuestion('move-1', 'relocation', { a: 1, b: -1, c: 0 }),
    ]

    expect(analyzeBirthTimeRankingRobustness(
      groups,
      questions,
      {
        'work-1': 'yes',
        'home-1': 'yes',
        'move-1': 'yes',
      },
      { source: 'none', dayparts: [] },
    )).toEqual({
      leaderGroupKey: 'a',
      testedAnswerCount: 3,
      stableAfterRemovingAnyOneAnswer: true,
      influentialQuestionIds: [],
    })
  })

  it('names the answers on which a fragile leader depends', () => {
    const groups = [
      mockGroup('a', 'morning'),
      mockGroup('b', 'evening'),
    ]
    const questions = [
      mockQuestion('work-1', 'work', { a: 1, b: 0 }),
      mockQuestion('home-1', 'home', { a: 1, b: 0 }),
      mockQuestion('move-1', 'relocation', { a: 0, b: 1 }),
    ]

    expect(analyzeBirthTimeRankingRobustness(
      groups,
      questions,
      {
        'work-1': 'yes',
        'home-1': 'yes',
        'move-1': 'yes',
      },
      { source: 'none', dayparts: [] },
    )).toMatchObject({
      leaderGroupKey: 'a',
      testedAnswerCount: 3,
      stableAfterRemovingAnyOneAnswer: false,
      influentialQuestionIds: ['work-1', 'home-1'],
    })
  })
})

function mockGroup(
  key: string,
  daypart: 'overnight' | 'morning' | 'daytime' | 'evening',
): BirthTimeCandidateGroup {
  const block = {
    id: `${key}-block`,
    label: `${key.toUpperCase()} Hour`,
    range: '00:00–00:59',
    hour: 0,
    daypart,
  }
  const candidate = {
    id: block.id,
    block,
    input: { year: 1990, month: 1, day: 1, hour: 0 },
    birthInfo: APPROXIMATE_BIRTH,
    resolved: {
      year: 1990,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      timeIndex: 0,
      originalShichen: 'Rat Hour',
      correctedShichen: 'Rat Hour',
      correctionMinutes: 0,
      applied: false,
      crossedDate: false,
      location: null,
    },
    chart: {} as FunctionalAstrolabe,
    groupKey: key,
  } satisfies BirthTimeCandidate
  return {
    key,
    candidates: [candidate],
    chart: candidate.chart,
  }
}

function mockQuestion(
  id: string,
  domain: BirthTimeQuestion['domain'],
  signals: Record<string, -1 | 0 | 1>,
): BirthTimeQuestion {
  return {
    id,
    domain,
    startYear: 2017,
    endYear: 2019,
    prompt: 'Question?',
    signals,
    discrimination: 1,
  }
}
