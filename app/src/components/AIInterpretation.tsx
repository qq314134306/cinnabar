/* ============================================================
   AI Reading panel
   Streams a chart-grounded reading from DeepSeek via /api/interpret,
   with a Scholar / Old Sage persona toggle.
   ============================================================ */

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChartStore, useSettingsStore, useContentCacheStore } from '@/stores'
import { buildZiWeiChartFacts } from '@/lib/chart-facts'
import { buildFreeReadingPrompt, buildSystemPrompt, DISCLAIMER, PERSONA_LABELS, type Persona } from '@/lib/ai-prompts'
import { streamChat, type ChatMessage } from '@/lib/llm'
import { Button } from '@/components/ui'
import { FutureReportPaywall } from '@/components/FutureReportPaywall'

/* ------------------------------------------------------------
   Character reveal speed (ms per character)
   ------------------------------------------------------------ */

const CHAR_INTERVAL = 35

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
}

/* ------------------------------------------------------------
   AI Reading component
   ------------------------------------------------------------ */

export function AIInterpretation() {
  const { chart, birthInfo } = useChartStore()
  const { persona, setPersona } = useSettingsStore()
  const { aiInterpretation, setAiInterpretation } = useContentCacheStore()

  const [displayText, setDisplayText] = useState('')
  const fullTextRef = useRef('')
  const displayIndexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (aiInterpretation && !displayText) {
      setDisplayText(aiInterpretation)
      fullTextRef.current = aiInterpretation
      displayIndexRef.current = aiInterpretation.length
    }
  }, [aiInterpretation, displayText])

  const startAnimation = useCallback(() => {
    if (timerRef.current) return

    setAnimating(true)
    timerRef.current = setInterval(() => {
      if (displayIndexRef.current < fullTextRef.current.length) {
        displayIndexRef.current++
        setDisplayText(fullTextRef.current.slice(0, displayIndexRef.current))
      } else if (!loadingRef.current) {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        setAnimating(false)
      }
    }, CHAR_INTERVAL)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleInterpret = useCallback(async () => {
    if (!chart || !birthInfo) return

    loadingRef.current = true
    setLoading(true)
    setError(null)
    setDisplayText('')
    fullTextRef.current = ''
    displayIndexRef.current = 0

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    try {
      const chartFacts = buildZiWeiChartFacts(chart, birthInfo)
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(persona) },
        { role: 'user', content: buildFreeReadingPrompt(chartFacts) },
      ]

      startAnimation()

      for await (const token of streamChat(messages)) {
        fullTextRef.current += token
      }

      setAiInterpretation(fullTextRef.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reading failed. Please try again.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [chart, birthInfo, persona, startAnimation, setAiInterpretation])

  if (!chart) return null

  return (
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

      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <h2
          className="
            text-xl lg:text-2xl font-semibold
            bg-gradient-to-r from-gold via-gold-light to-gold
            bg-clip-text text-transparent
          "
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Your Cinnabar Reading
        </h2>

        <div className="flex items-center gap-3">
          {/* Persona toggle */}
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

          <Button onClick={handleInterpret} disabled={loading} size="sm" variant="gold">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-night border-t-transparent rounded-full animate-spin" />
                Reading
              </span>
            ) : displayText ? 'Read Again' : 'Get My Free Reading'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm mb-4 border border-misfortune/20">
          {error}
        </div>
      )}

      {!displayText && !loading && (
        <div className="text-text-muted text-sm py-8 text-center">
          <div className="text-3xl mb-3 opacity-30">☆</div>
          Choose your reader's voice above, then get a free reading grounded in your real chart.
        </div>
      )}

      {displayText && (
        <div
          className="
            prose prose-invert max-w-none
            text-text-secondary text-lg lg:text-xl leading-loose
          "
          style={{ fontFamily: 'var(--font-brush)' }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
            {displayText}
          </ReactMarkdown>

          {animating && (
            <span className="inline-block w-0.5 h-5 bg-gold/80 animate-pulse ml-0.5 align-middle" />
          )}

          {!animating && (
            <p className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-text-muted not-italic font-sans">
              {DISCLAIMER}
            </p>
          )}
        </div>
      )}

      {loading && !displayText && (
        <div className="flex items-center justify-center gap-3 text-text-muted py-12">
          <div className="w-5 h-5 border-2 border-star border-t-transparent rounded-full animate-spin" />
          <span>Casting your reading...</span>
        </div>
      )}

      {displayText && !animating && <FutureReportPaywall />}
    </div>
  )
}
