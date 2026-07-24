/* ============================================================
   Compatibility — two-chart reading
   ============================================================ */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSettingsStore } from '@/stores'
import type { BirthInfo, Gender } from '@/lib/astro'
import { clampDayToMonth, getDayOptions, getMonthOptions, getYearOptions } from '@/lib/birth-date'
import { getShichenOptions } from '@/lib/shichen'
import { DISCLAIMER, PERSONA_LABELS, type Persona } from '@/lib/ai-prompts'
import { streamReading } from '@/lib/llm'
import {
  isPublicAiReadingEnabled,
  PUBLIC_AI_UNAVAILABLE_MESSAGE,
} from '@/lib/public-ai'
import { buildCompatibilityReadingRequest } from '@/lib/reading-contract'
import {
  compareBirthCharts,
  type LocalCompatibilityResult,
} from '@/lib/compatibility-score'
import { Button, Select } from '@/components/ui'

const YEAR_OPTIONS = getYearOptions()
const MONTH_OPTIONS = getMonthOptions()
const HOUR_OPTIONS = getShichenOptions()
const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]
const PERSONAS: Persona[] = ['scholar', 'sage']

/* ------------------------------------------------------------
   Markdown styling
   ------------------------------------------------------------ */

const MarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-gold mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gold/90 mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-medium text-star-light mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-gold font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-none space-y-1.5 mb-3 pl-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1.5 mb-3 pl-2">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="relative pl-4 before:content-['◆'] before:absolute before:left-0 before:text-star/60 before:text-xs">
      {children}
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-gold/40 pl-4 my-3 italic text-text-secondary">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-text-muted not-italic">{children}</em>
  ),
}

/* ------------------------------------------------------------
   Person input card
   ------------------------------------------------------------ */

interface PersonInputProps {
  label: string
  value: BirthInfo
  onChange: (info: BirthInfo) => void
  disabled: boolean
}

function PersonInput({ label, value, onChange, disabled }: PersonInputProps) {
  const inputIdPrefix = label.toLowerCase().replace(/\s+/g, '-')
  const update = (field: keyof BirthInfo, val: number | Gender) => {
    const next = { ...value, [field]: val }
    if (field === 'year' || field === 'month') {
      next.day = clampDayToMonth(next.year, next.month, next.day)
    }
    onChange(next)
  }
  const dayOptions = getDayOptions(value.year, value.month)

  return (
    <div
      className="
        relative p-5
        bg-gradient-to-br from-white/[0.04] to-transparent
        backdrop-blur-xl border border-white/[0.08] rounded-xl
        shadow-[0_4px_20px_rgba(0,0,0,0.2)]
      "
    >
      <h3
        className="text-lg font-medium mb-4 bg-gradient-to-r from-star-light to-gold bg-clip-text text-transparent"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {label}
      </h3>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select
            id={`${inputIdPrefix}-year`}
            label="Year"
            aria-label={`${label} year of birth`}
            options={YEAR_OPTIONS}
            value={value.year}
            onChange={(e) => update('year', Number(e.target.value))}
            disabled={disabled}
          />
          <Select
            id={`${inputIdPrefix}-month`}
            label="Month"
            aria-label={`${label} month of birth`}
            options={MONTH_OPTIONS}
            value={value.month}
            onChange={(e) => update('month', Number(e.target.value))}
            disabled={disabled}
          />
          <Select
            id={`${inputIdPrefix}-day`}
            label="Day"
            aria-label={`${label} day of birth`}
            options={dayOptions}
            value={value.day}
            onChange={(e) => update('day', Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <Select
          id={`${inputIdPrefix}-hour`}
          label="Birth Hour"
          aria-label={`${label} birth hour`}
          options={HOUR_OPTIONS}
          value={value.hour}
          onChange={(e) => update('hour', Number(e.target.value))}
          disabled={disabled}
        />
        <fieldset className="flex gap-2">
          <legend className="sr-only">{label} gender</legend>
          {GENDER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`
                flex-1 py-2 px-3 rounded-lg text-center text-sm transition-all
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${value.gender === opt.value
                  ? 'bg-star text-white'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
                }
              `}
            >
              <input
                type="radio"
                name={`${inputIdPrefix}-gender`}
                aria-label={`${label} ${opt.label}`}
                value={opt.value}
                checked={value.gender === opt.value}
                onChange={() => update('gender', opt.value as Gender)}
                disabled={disabled}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------
   Compatibility main component
   ------------------------------------------------------------ */

export function MatchAnalysis() {
  const { persona, setPersona } = useSettingsStore()
  const publicAiEnabled = isPublicAiReadingEnabled()

  const [person1, setPerson1] = useState<BirthInfo>({
    year: 1990, month: 1, day: 1, hour: 12, gender: 'male',
  })
  const [person2, setPerson2] = useState<BirthInfo>({
    year: 1992, month: 6, day: 15, hour: 14, gender: 'female',
  })
  const [localResult, setLocalResult] = useState<LocalCompatibilityResult | null>(null)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const request = useMemo(
    () => buildCompatibilityReadingRequest(person1, person2, persona),
    [person1, person2, persona],
  )
  const requestKey = useMemo(() => JSON.stringify(request), [request])
  const previousRequestKeyRef = useRef(requestKey)
  const previousPerson1Ref = useRef(person1)
  const previousPerson2Ref = useRef(person2)
  const latestRequestKeyRef = useRef(requestKey)
  const latestPerson1Ref = useRef(person1)
  const latestPerson2Ref = useRef(person2)

  latestRequestKeyRef.current = requestKey
  latestPerson1Ref.current = person1
  latestPerson2Ref.current = person2

  useEffect(() => {
    const contextChanged = (
      previousRequestKeyRef.current !== requestKey
      || previousPerson1Ref.current !== person1
      || previousPerson2Ref.current !== person2
    )
    previousRequestKeyRef.current = requestKey
    previousPerson1Ref.current = person1
    previousPerson2Ref.current = person2
    if (!contextChanged) return

    const controller = requestRef.current
    requestRef.current = null
    controller?.abort()
    setLoading(false)
    setLocalResult(null)
    setResult('')
    setError(null)
  }, [person1, person2, requestKey])

  useEffect(() => {
    return () => {
      const controller = requestRef.current
      requestRef.current = null
      controller?.abort()
    }
  }, [])

  const handleLocalCompare = useCallback(() => {
    try {
      setLocalResult(compareBirthCharts(person1, person2))
      setError(null)
    } catch (err) {
      setLocalResult(null)
      setError(
        err instanceof Error
          ? err.message
          : 'The local comparison could not be built. Check both birth dates and try again.',
      )
    }
  }, [person1, person2])

  const handleAnalyze = useCallback(async () => {
    if (!publicAiEnabled) return

    const previousController = requestRef.current
    requestRef.current = null
    previousController?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const activePerson1 = person1
    const activePerson2 = person2
    const activeRequestKey = requestKey

    setLoading(true)
    setError(null)
    setResult('')

    try {
      let fullText = ''
      for await (const token of streamReading(request, { signal: controller.signal })) {
        if (
          requestRef.current !== controller
          || latestRequestKeyRef.current !== activeRequestKey
          || latestPerson1Ref.current !== activePerson1
          || latestPerson2Ref.current !== activePerson2
        ) return
        fullText += token
        setResult(fullText)
      }
      if (
        requestRef.current !== controller
        || latestRequestKeyRef.current !== activeRequestKey
        || latestPerson1Ref.current !== activePerson1
        || latestPerson2Ref.current !== activePerson2
      ) return
    } catch (err) {
      if (
        controller.signal.aborted
        || requestRef.current !== controller
        || latestRequestKeyRef.current !== activeRequestKey
        || latestPerson1Ref.current !== activePerson1
        || latestPerson2Ref.current !== activePerson2
      ) return
      setError(err instanceof Error ? err.message : 'The analysis failed. Please try again.')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [person1, person2, publicAiEnabled, request, requestKey])

  return (
    <div className="animate-fade-in space-y-8 max-w-6xl mx-auto">
      {/* Top: two-person input + button */}
      <div
        className="
          relative p-6 lg:p-8
          bg-gradient-to-br from-white/[0.04] to-transparent
          backdrop-blur-xl border border-white/[0.08] rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        <div
          className="
            absolute top-0 left-1/2 -translate-x-1/2
            w-1/3 h-px
            bg-gradient-to-r from-transparent via-gold/50 to-transparent
          "
        />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
          <h2
            className="
              text-xl lg:text-2xl font-semibold
              bg-gradient-to-r from-gold via-gold-light to-gold
              bg-clip-text text-transparent
            "
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Compatibility
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleLocalCompare}
              disabled={loading}
              size="sm"
              variant="gold"
            >
              Compare Locally
            </Button>

            {publicAiEnabled && (
              <>
                <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
                  {PERSONAS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPersona(p)}
                      disabled={loading}
                      className={`
                        px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                        disabled:cursor-not-allowed disabled:opacity-50
                        ${persona === p ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary'}
                      `}
                    >
                      {PERSONA_LABELS[p]}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={loading}
                  size="sm"
                  variant="secondary"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
                      Reading
                    </span>
                  ) : 'Add AI Reading'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Two-person input */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PersonInput
            label="Person A"
            value={person1}
            onChange={setPerson1}
            disabled={loading}
          />
          <PersonInput
            label="Person B"
            value={person2}
            onChange={setPerson2}
            disabled={loading}
          />
        </div>

        {!publicAiEnabled && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm text-text-secondary"
          >
            {PUBLIC_AI_UNAVAILABLE_MESSAGE} The local comparison above remains
            available and does not use an account, API, or payment.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20"
          >
            {error}
          </div>
        )}
      </div>

      {/* Local result */}
      <div
        className="
          relative p-6 lg:p-8
          bg-gradient-to-br from-white/[0.04] to-transparent
          backdrop-blur-xl border border-white/[0.08] rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        <div
          className="
            absolute top-0 left-1/2 -translate-x-1/2
            w-1/3 h-px
            bg-gradient-to-r from-transparent via-star/50 to-transparent
          "
        />

        {!localResult && (
          <div className="py-8 text-center text-sm text-text-muted">
            Enter both birth details and choose “Compare Locally” for an
            immediate chart-derived snapshot.
          </div>
        )}

        {localResult && <LocalCompatibilitySnapshot result={localResult} />}
      </div>

      {publicAiEnabled && (
        <div
          className="
            relative p-6 lg:p-8
            bg-gradient-to-br from-white/[0.04] to-transparent
            backdrop-blur-xl border border-white/[0.08] rounded-2xl
            shadow-[0_8px_32px_rgba(0,0,0,0.3)]
          "
        >
          <div className="absolute top-0 left-1/2 h-px w-1/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-star/50 to-transparent" />

          {!result && !loading && (
            <div className="py-8 text-center text-sm text-text-muted">
              Optional AI narrative: choose a voice and select “Add AI Reading”.
            </div>
          )}

          {loading && !result && (
            <div className="flex items-center justify-center gap-3 py-12 text-text-muted">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-star border-t-transparent" />
              <span>Reading your compatibility...</span>
            </div>
          )}

          {result && (
            <div
              className="
                prose prose-invert max-w-none
                text-text-secondary text-lg lg:text-xl leading-loose
              "
              style={{ fontFamily: 'var(--font-brush)' }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                {result}
              </ReactMarkdown>
              {!loading && (
                <p className="mt-6 border-t border-white/[0.06] pt-4 font-sans text-xs not-italic text-text-muted">
                  {DISCLAIMER}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LocalCompatibilitySnapshot({
  result,
}: {
  result: LocalCompatibilityResult
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
            Local compatibility snapshot · {result.year}
          </p>
          <h3
            className="mt-2 text-2xl font-semibold text-gold"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {result.label}
          </h3>
        </div>
        <div className="flex items-end gap-2">
          <span className="font-mono text-5xl font-semibold text-white">
            {result.overall}
          </span>
          <span className="pb-1 text-sm text-text-muted">/ 100</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['Person A', result.personA],
          ['Person B', result.personB],
        ] as const).map(([label, person]) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
              {label} · {person.element}
            </p>
            <p className="mt-2 font-medium text-text">{person.identity}</p>
            <p className="mt-2 text-xs text-text-muted">
              {person.keywords.join(' · ')}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {result.dimensions.map((dimension) => (
          <div
            key={dimension.key}
            className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-medium text-text">{dimension.label}</h4>
              <span className="font-mono text-sm text-gold">
                {dimension.score}/100
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={dimension.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={dimension.score}
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-star to-gold"
                style={{ width: `${dimension.score}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              {dimension.summary}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-green-400/15 bg-green-400/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-green-300/80">
            Strongest signal
          </p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {result.strongestSignal}
          </p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-gold/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gold/80">
            Growth edge
          </p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {result.growthEdge}
          </p>
        </div>
      </div>

      <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm leading-relaxed text-text-muted">
        {result.elementStory}
      </p>

      <p className="border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-text-muted">
        This is a deterministic reflective model based on the two entered birth
        charts and the current model year. It is not scientific evidence,
        relationship advice, or a prediction of outcomes.
      </p>
    </div>
  )
}
