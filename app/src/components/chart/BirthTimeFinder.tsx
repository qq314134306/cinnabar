import { useEffect, useMemo, useRef, useState } from 'react'
import type { BirthInfo } from '@/lib/astro'
import {
  BirthTimeFinderInputError,
  buildBirthTimeCandidates,
  buildBirthTimeQuestionsAsync,
  groupEquivalentCandidates,
  scoreBirthTimeGroups,
  shouldStopBirthTimeQuestions,
  type BirthTimeCandidate,
  type BirthTimeCandidateGroup,
  type BirthTimeQuestion,
  type BirthTimeRanking,
  type EventAnswer,
  type RecallDaypart,
  type RecallSource,
} from '@/lib/birth-time-finder'
import { translateShichen } from '@/lib/ziwei-glossary'
import { Button, Input } from '@/components/ui'

interface BirthTimeFinderProps {
  birthInfo: BirthInfo
  onApply: (candidate: BirthTimeCandidate) => void
  onClose: () => void
}

type FinderPhase = 'setup' | 'questions' | 'results'

const DAYPARTS: Array<{
  value: RecallDaypart
  label: string
  range: string
}> = [
  { value: 'overnight', label: 'Overnight', range: '23:00–04:59' },
  { value: 'morning', label: 'Morning', range: '05:00–10:59' },
  { value: 'daytime', label: 'Daytime', range: '11:00–16:59' },
  { value: 'evening', label: 'Evening', range: '17:00–22:59' },
]

const SOURCES: Array<{
  value: RecallSource
  label: string
}> = [
  { value: 'written', label: 'Written record or document' },
  { value: 'family', label: 'Family recollection' },
  { value: 'impression', label: 'Rough impression' },
  { value: 'none', label: 'No useful time clue' },
]

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDate(year: number, month: number, day: number): string {
  return DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)))
}

export function BirthTimeFinder({
  birthInfo,
  onApply,
  onClose,
}: BirthTimeFinderProps) {
  const [phase, setPhase] = useState<FinderPhase>('setup')
  const [birthplace, setBirthplace] = useState(birthInfo.birthplace ?? '')
  const [dayparts, setDayparts] = useState<RecallDaypart[]>([])
  const [source, setSource] = useState<RecallSource>('none')
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<BirthTimeCandidateGroup[]>([])
  const [questions, setQuestions] = useState<BirthTimeQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, EventAnswer>>({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [ranking, setRanking] = useState<BirthTimeRanking | null>(null)
  const preparationIdRef = useRef(0)
  const sectionRef = useRef<HTMLElement | null>(null)
  const questionPanelRef = useRef<HTMLDivElement | null>(null)
  const resultsPanelRef = useRef<HTMLDivElement | null>(null)

  const recall = useMemo(() => ({ dayparts, source }), [dayparts, source])
  const displayedResults = useMemo(() => {
    if (!ranking || ranking.noClearSeparation) {
      return { cards: [], boundaryTies: [] }
    }
    if (ranking.ranked.length <= 3) {
      return { cards: ranking.ranked, boundaryTies: [] }
    }
    const cutoffScore = ranking.ranked[2]?.score
    if (
      cutoffScore === undefined
      || ranking.ranked[3]?.score !== cutoffScore
    ) {
      return { cards: ranking.ranked.slice(0, 3), boundaryTies: [] }
    }
    return {
      cards: ranking.ranked.filter((item) => item.score > cutoffScore),
      boundaryTies: ranking.ranked.filter((item) => item.score === cutoffScore),
    }
  }, [ranking])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      preparationIdRef.current += 1
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const target = phase === 'questions'
      ? questionPanelRef.current
      : phase === 'results'
        ? resultsPanelRef.current
        : sectionRef.current
    const focusTimer = window.setTimeout(() => target?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [phase, questionIndex])

  const reset = () => {
    preparationIdRef.current += 1
    setPhase('setup')
    setPreparing(false)
    setError(null)
    setGroups([])
    setQuestions([])
    setAnswers({})
    setQuestionIndex(0)
    setRanking(null)
  }

  const toggleDaypart = (daypart: RecallDaypart) => {
    setDayparts((current) => (
      current.includes(daypart)
        ? current.filter((item) => item !== daypart)
        : [...current, daypart]
    ))
  }

  const prepareCandidates = async () => {
    if (preparing) return
    const preparationId = preparationIdRef.current + 1
    preparationIdRef.current = preparationId
    setPreparing(true)
    setError(null)

    try {
      const isCurrentPreparation = () => (
        preparationIdRef.current === preparationId
      )
      const candidates = await buildBirthTimeCandidates(
        birthInfo,
        birthplace,
        isCurrentPreparation,
      )
      if (preparationIdRef.current !== preparationId) return
      const nextGroups = groupEquivalentCandidates(candidates)
      const nextQuestions = await buildBirthTimeQuestionsAsync(
        nextGroups,
        birthInfo.year,
        new Date().getFullYear(),
        5,
        isCurrentPreparation,
      )
      if (preparationIdRef.current !== preparationId) return

      setGroups(nextGroups)
      setQuestions(nextQuestions)
      setAnswers({})
      setQuestionIndex(0)
      if (nextQuestions.length === 0) {
        setRanking(scoreBirthTimeGroups(nextGroups, [], {}, recall))
        setPhase('results')
      } else {
        setPhase('questions')
      }
    } catch (caught) {
      if (preparationIdRef.current !== preparationId) return
      setError(
        caught instanceof BirthTimeFinderInputError
          ? caught.message
          : 'The local time-block comparison could not be prepared. Check the birthplace and try again.',
      )
    } finally {
      if (preparationIdRef.current === preparationId) {
        setPreparing(false)
      }
    }
  }

  const answerQuestion = (answer: EventAnswer) => {
    const question = questions[questionIndex]
    if (!question) return
    const nextAnswers = { ...answers, [question.id]: answer }
    const nextRanking = scoreBirthTimeGroups(
      groups,
      questions,
      nextAnswers,
      recall,
    )
    setAnswers(nextAnswers)
    if (
      questionIndex >= questions.length - 1
      || shouldStopBirthTimeQuestions(nextRanking)
    ) {
      setRanking(nextRanking)
      setPhase('results')
    } else {
      setQuestionIndex((current) => current + 1)
    }
  }

  const currentQuestion = questions[questionIndex] ?? null

  return (
    <section
      id="birth-time-finder"
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="birth-time-finder-title"
      className="mt-5 rounded-xl border border-star/20 bg-black/15 p-4 lg:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.18em] text-star-light/80">
            Local time-block shortlist
          </p>
          <h4
            id="birth-time-finder-title"
            className="mt-1 text-base font-semibold text-text lg:text-lg"
          >
            Compare Life Events Across 13 Time Blocks
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Cinnabar resolves every civil-time block through the exact
            birthplace first, then compares a small set of past-event answers.
            This produces evidence points—not an exact birth time, probability,
            or minute-level result.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close birth-time shortlist"
          className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star"
        >
          Close
        </button>
      </div>

      {phase === 'setup' && (
        <div className="mt-5 space-y-5">
          <Input
            id="birth-time-finder-place"
            label="Exact local birthplace"
            hint="A recognized city is required. The 13 candidates are corrected locally before any chart is compared."
            value={birthplace}
            onChange={(event) => setBirthplace(event.target.value)}
            disabled={preparing}
          />

          <fieldset>
            <legend className="text-sm font-medium text-text">
              Rough time of day (optional, choose any that fit)
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DAYPARTS.map((daypart) => (
                <label
                  key={daypart.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm text-text-secondary"
                >
                  <input
                    type="checkbox"
                    checked={dayparts.includes(daypart.value)}
                    onChange={() => toggleDaypart(daypart.value)}
                    disabled={preparing}
                    className="h-4 w-4 accent-gold"
                  />
                  <span>
                    {daypart.label}
                    <span className="ml-1 text-xs text-text-muted">
                      {daypart.range}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-text">
              Source of that rough time
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SOURCES.map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm text-text-secondary"
                >
                  <input
                    type="radio"
                    name="birth-time-recall-source"
                    checked={source === item.value}
                    onChange={() => setSource(item.value)}
                    disabled={preparing}
                    className="h-4 w-4 accent-gold"
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              A rough clue contributes at most ±2 points. Event answers remain
              the main evidence.
            </p>
          </fieldset>

          <Button
            onClick={prepareCandidates}
            disabled={preparing}
            variant="gold"
          >
            {preparing
              ? 'Resolving 13 solar-time candidates…'
              : 'Prepare 13 Time Blocks'}
          </Button>
        </div>
      )}

      {phase === 'questions' && currentQuestion && (
        <div
          ref={questionPanelRef}
          role="group"
          tabIndex={-1}
          aria-labelledby="birth-time-finder-question-progress birth-time-finder-question"
          className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star"
        >
          <p
            id="birth-time-finder-question-progress"
            aria-live="polite"
            className="text-xs uppercase tracking-[0.14em] text-gold/75"
          >
            Question {questionIndex + 1} of {questions.length}
          </p>
          <p
            id="birth-time-finder-question"
            className="mt-3 text-base leading-relaxed text-text"
          >
            {currentQuestion.prompt}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            Answer from memory. “Not sure” and “Prefer not to answer” add no
            points. Each three-year range uses its middle year as the local
            annual chart probe.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => answerQuestion('yes')} variant="gold">
              Yes
            </Button>
            <Button onClick={() => answerQuestion('no')} variant="secondary">
              No
            </Button>
            <Button
              onClick={() => answerQuestion('uncertain')}
              variant="ghost"
            >
              Not sure
            </Button>
            <Button onClick={() => answerQuestion('skip')} variant="ghost">
              Prefer not to answer
            </Button>
          </div>
        </div>
      )}

      {phase === 'results' && ranking && (
        <div
          ref={resultsPanelRef}
          role="region"
          tabIndex={-1}
          aria-labelledby="birth-time-finder-results-title"
          className="mt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star"
        >
          <h5 id="birth-time-finder-results-title" className="sr-only">
            Birth-time shortlist results
          </h5>
          <div
            role="status"
            className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm leading-relaxed text-text-secondary"
          >
            {ranking.noClearSeparation
              ? 'Your answers do not clearly separate the time blocks, so Cinnabar has not narrowed or recommended a candidate. Keep the current chart or start over with stronger memories.'
              : 'These groups are most consistent with the answers you gave under Cinnabar’s local heuristic model.'}
          </div>

          {questions.length === 0 && (
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              The available adult-year chart facts did not produce enough
              differentiating questions. Cinnabar will not turn the optional
              rough-time clue into a recommendation on its own.
            </p>
          )}

          {displayedResults.cards.length > 0 && (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {displayedResults.cards.map((item, index) => {
              const first = item.group.candidates[0]
              const tiedWithPrevious = index > 0
                && displayedResults.cards[index - 1]?.score === item.score
              const heading = tiedWithPrevious
                || displayedResults.cards[index + 1]?.score === item.score
                ? 'Tied evidence'
                : index === 0 && !ranking.noClearSeparation
                  ? 'Most consistent with your answers'
                  : 'Also plausible'

              return (
                <article
                  key={item.group.key}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.13em] text-gold/75">
                    {heading}
                  </p>
                  <h5 className="mt-2 text-sm font-semibold text-text">
                    {item.group.candidates
                      .map((candidate) => candidate.block.label)
                      .join(' / ')}
                  </h5>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.group.candidates
                      .map((candidate) => candidate.block.range)
                      .join(' · ')}
                  </p>
                  <p className="mt-3 text-sm text-gold">
                    {item.score > 0 ? '+' : ''}{item.score} evidence points
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                    Common solar-resolved chart from {
                      first.resolved.location?.enName
                      ?? first.resolved.location?.name
                      ?? 'the matched birthplace'
                    } to {translateShichen(first.resolved.correctedShichen)}
                    {' · '}
                    {formatDate(
                      first.resolved.year,
                      first.resolved.month,
                      first.resolved.day,
                    )}
                  </p>
                  {item.group.candidates.length > 1 && (
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">
                      These civil-time entries collapse to the same
                      solar-resolved chart and remain equivalent.
                    </p>
                  )}

                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <p className="text-xs font-medium text-text-secondary">
                      Evidence ledger
                    </p>
                    {item.evidence.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-text-muted">
                        {item.evidence.map((line) => (
                          <li key={line.id}>{line.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-text-muted">
                        No non-zero evidence for this group.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {item.group.candidates.map((candidate) => {
                      const correctedHour = String(
                        candidate.resolved.hour,
                      ).padStart(2, '0')
                      const correctedMinute = String(
                        candidate.resolved.minute,
                      ).padStart(2, '0')
                      return (
                        <div
                          key={candidate.id}
                          className="rounded-lg border border-white/[0.06] bg-black/10 p-2"
                        >
                          <p className="mb-2 text-xs leading-relaxed text-text-muted">
                            {candidate.block.range} {' → '}
                            {correctedHour}:{correctedMinute}
                            {' · '}
                            {candidate.resolved.correctionMinutes > 0 ? '+' : ''}
                            {candidate.resolved.correctionMinutes} min
                            {candidate.resolved.crossedDate
                              ? ` · ${formatDate(
                                  candidate.resolved.year,
                                  candidate.resolved.month,
                                  candidate.resolved.day,
                                )}`
                              : ''}
                          </p>
                          <Button
                            onClick={() => onApply(candidate)}
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            aria-label={`Use ${candidate.block.label}, ${candidate.block.range}`}
                          >
                            Use {candidate.block.label}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )
            })}
            </div>
          )}

          {displayedResults.boundaryTies.length > 0 && (
            <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm leading-relaxed text-text-secondary">
              The next evidence tier is tied across{' '}
              {displayedResults.boundaryTies
                .flatMap((item) => item.group.candidates)
                .map((candidate) => candidate.block.label)
                .join(', ')}
              . Cinnabar does not choose an arbitrary third candidate from that
              tie; add stronger memories in a new run before applying one.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={reset} variant="ghost" size="sm">
              Start over
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              Keep current chart
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-misfortune/20 bg-misfortune/10 p-3 text-sm text-misfortune"
        >
          {error}
        </div>
      )}

      <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-text-muted">
        Method boundary: the score compares annual Life Palace placement,
        Major Limit palace, and the natal-palace locations of annual Four
        Transformations. It is a deterministic reflective heuristic, not
        scientific validation or proof of a correct hour.
      </p>
    </section>
  )
}
