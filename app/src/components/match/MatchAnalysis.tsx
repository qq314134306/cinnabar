/* ============================================================
   Compatibility — two-chart reading
   ============================================================ */

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSettingsStore } from '@/stores'
import { generateChart, getShichenOptions, type BirthInfo, type Gender } from '@/lib/astro'
import { clampDayToMonth, getDayOptions, getMonthOptions, getYearOptions } from '@/lib/birth-date'
import { buildZiWeiChartFacts } from '@/lib/chart-facts'
import { buildCompatibilityPrompt, buildSystemPrompt, DISCLAIMER, PERSONA_LABELS, type Persona } from '@/lib/ai-prompts'
import { streamChat, type ChatMessage } from '@/lib/llm'
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
}

function PersonInput({ label, value, onChange }: PersonInputProps) {
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
        <div className="grid grid-cols-3 gap-2">
          <Select
            label="Year"
            options={YEAR_OPTIONS}
            value={value.year}
            onChange={(e) => update('year', Number(e.target.value))}
          />
          <Select
            label="Month"
            options={MONTH_OPTIONS}
            value={value.month}
            onChange={(e) => update('month', Number(e.target.value))}
          />
          <Select
            label="Day"
            options={dayOptions}
            value={value.day}
            onChange={(e) => update('day', Number(e.target.value))}
          />
        </div>
        <Select
          label="Birth Hour"
          options={HOUR_OPTIONS}
          value={value.hour}
          onChange={(e) => update('hour', Number(e.target.value))}
        />
        <div className="flex gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`
                flex-1 py-2 px-3 rounded-lg text-center text-sm cursor-pointer transition-all
                ${value.gender === opt.value
                  ? 'bg-star text-white'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
                }
              `}
            >
              <input
                type="radio"
                value={opt.value}
                checked={value.gender === opt.value}
                onChange={() => update('gender', opt.value as Gender)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------
   Compatibility main component
   ------------------------------------------------------------ */

export function MatchAnalysis() {
  const { persona, setPersona } = useSettingsStore()

  const [person1, setPerson1] = useState<BirthInfo>({
    year: 1990, month: 1, day: 1, hour: 12, gender: 'male',
  })
  const [person2, setPerson2] = useState<BirthInfo>({
    year: 1992, month: 6, day: 15, hour: 14, gender: 'female',
  })
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult('')

    try {
      const chart1 = generateChart(person1)
      const chart2 = generateChart(person2)

      const facts1 = buildZiWeiChartFacts(chart1, person1, { label: 'PERSON A' })
      const facts2 = buildZiWeiChartFacts(chart2, person2, { label: 'PERSON B' })

      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(persona) },
        { role: 'user', content: buildCompatibilityPrompt(facts1, facts2) },
      ]

      let fullText = ''
      for await (const token of streamChat(messages)) {
        fullText += token
        setResult(fullText)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [person1, person2, persona])

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

          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
              {PERSONAS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  className={`
                    px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                    ${persona === p ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary'}
                  `}
                >
                  {PERSONA_LABELS[p]}
                </button>
              ))}
            </div>

            <Button onClick={handleAnalyze} disabled={loading} size="sm" variant="gold">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-night border-t-transparent rounded-full animate-spin" />
                  Reading
                </span>
              ) : 'Read Our Compatibility'}
            </Button>
          </div>
        </div>

        {/* Two-person input */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PersonInput label="Person A" value={person1} onChange={setPerson1} />
          <PersonInput label="Person B" value={person2} onChange={setPerson2} />
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20">
            {error}
          </div>
        )}
      </div>

      {/* Result */}
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

        {!result && !loading && (
          <div className="text-text-muted text-sm py-8 text-center">
            <div className="text-3xl mb-3 opacity-30">⚭</div>
            Enter both birth details and click "Read Our Compatibility".
          </div>
        )}

        {loading && !result && (
          <div className="flex items-center justify-center gap-3 text-text-muted py-12">
            <div className="w-5 h-5 border-2 border-star border-t-transparent rounded-full animate-spin" />
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
              <p className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-text-muted not-italic font-sans">
                {DISCLAIMER}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
