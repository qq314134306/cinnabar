/* ============================================================
   AI Reading panel
   Streams a chart-grounded reading from DeepSeek via /api/interpret,
   with a Scholar / Old Sage persona toggle.
   ============================================================ */

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChartStore, useSettingsStore, useContentCacheStore } from '@/stores'
import { DISCLAIMER, PERSONA_LABELS, type Persona } from '@/lib/ai-prompts'
import { ReadingApiError, streamReading } from '@/lib/llm'
import {
  isPublicAiReadingEnabled,
  PUBLIC_AI_UNAVAILABLE_MESSAGE,
} from '@/lib/public-ai'
import { buildNatalReadingRequest } from '@/lib/reading-contract'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { Button } from '@/components/ui'
import { FutureReportPaywall } from '@/components/FutureReportPaywall'
import { SoulCard } from '@/components/SoulCard'
import { EmailCapture } from '@/components/EmailCapture'
import { LocalChartSnapshot } from '@/components/LocalChartSnapshot'
import { analytics } from '@/lib/analytics'

/* ------------------------------------------------------------
   Character reveal speed (ms per character)
   ------------------------------------------------------------ */

const CHAR_INTERVAL = 35
const READING_RETRY_MESSAGE =
  'The reading could not be completed. Please try again.'

const PERSONAS: Persona[] = ['scholar', 'sage']

function getNatalReadingRequestKey(
  birthInfo: BirthInfo,
  persona: Persona,
): string {
  return JSON.stringify(buildNatalReadingRequest(birthInfo, persona))
}

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
  const publicAiEnabled = isPublicAiReadingEnabled()
  const {
    aiInterpretation,
    aiInterpretationKey,
    setAiInterpretation,
  } = useContentCacheStore()

  const requestKey = birthInfo
    ? getNatalReadingRequestKey(birthInfo, persona)
    : null
  const initialText = (
    requestKey
    && aiInterpretationKey === requestKey
    && aiInterpretation
  ) || ''

  const [displayText, setDisplayText] = useState(initialText)
  const fullTextRef = useRef(initialText)
  const displayIndexRef = useRef(initialText.length)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const previousRequestKeyRef = useRef(requestKey)
  const previousChartRef = useRef<FunctionalAstrolabe | null>(chart)
  const latestRequestKeyRef = useRef(requestKey)
  const latestChartRef = useRef<FunctionalAstrolabe | null>(chart)
  const loadingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  latestRequestKeyRef.current = requestKey
  latestChartRef.current = chart

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
    const contextChanged = (
      previousRequestKeyRef.current !== requestKey
      || previousChartRef.current !== chart
    )
    previousRequestKeyRef.current = requestKey
    previousChartRef.current = chart

    if (!contextChanged) {
      if (
        (aiInterpretation !== null || aiInterpretationKey !== null)
        && aiInterpretationKey !== requestKey
      ) {
        setAiInterpretation(null, null)
      }
      return
    }

    const controller = requestRef.current
    requestRef.current = null
    controller?.abort()

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    loadingRef.current = false
    fullTextRef.current = ''
    displayIndexRef.current = 0
    setLoading(false)
    setAnimating(false)
    setError(null)
    setDisplayText('')
    setAiInterpretation(null, null)
  }, [
    aiInterpretation,
    aiInterpretationKey,
    chart,
    requestKey,
    setAiInterpretation,
  ])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      const controller = requestRef.current
      requestRef.current = null
      loadingRef.current = false
      controller?.abort()
    }
  }, [])

  const handleInterpret = useCallback(async () => {
    if (!publicAiEnabled || !chart || !birthInfo || !requestKey) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const activeChart = chart
    const activeRequestKey = requestKey
    const request = buildNatalReadingRequest(birthInfo, persona)

    loadingRef.current = true
    setLoading(true)
    setError(null)
    setDisplayText('')
    fullTextRef.current = ''
    displayIndexRef.current = 0
    setAiInterpretation(null, null)

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    analytics.startReading()

    try {
      startAnimation()

      for await (const token of streamReading(request, { signal: controller.signal })) {
        if (
          requestRef.current !== controller
          || latestRequestKeyRef.current !== activeRequestKey
          || latestChartRef.current !== activeChart
        ) return
        fullTextRef.current += token
      }

      if (
        requestRef.current !== controller
        || latestRequestKeyRef.current !== activeRequestKey
        || latestChartRef.current !== activeChart
      ) return
      setAiInterpretation(fullTextRef.current, activeRequestKey)
      analytics.completeReading()
    } catch (err) {
      if (
        controller.signal.aborted
        || requestRef.current !== controller
        || latestRequestKeyRef.current !== activeRequestKey
        || latestChartRef.current !== activeChart
      ) return
      setError(
        err instanceof ReadingApiError
          ? err.message
          : READING_RETRY_MESSAGE,
      )
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [
    birthInfo,
    chart,
    persona,
    publicAiEnabled,
    requestKey,
    setAiInterpretation,
    startAnimation,
  ])

  if (!chart) return null

  if (!publicAiEnabled) {
    return (
      <div className="space-y-4">
        <LocalChartSnapshot />
        <div
          className="
            relative rounded-2xl border border-white/[0.08]
            bg-gradient-to-br from-white/[0.04] to-transparent p-6
            shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:p-8
          "
        >
          <h2
            className="mb-4 text-xl font-semibold text-gold lg:text-2xl"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Optional AI Narrative
          </h2>
          <div
            role="status"
            className="rounded-lg border border-gold/20 bg-gold/5 p-4 text-sm text-text-secondary"
          >
            {PUBLIC_AI_UNAVAILABLE_MESSAGE} Your local snapshot above remains
            available without an account, API, or payment.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <LocalChartSnapshot />
      <div
        className="
          relative rounded-2xl border border-white/[0.08]
          bg-gradient-to-br from-white/[0.04] to-transparent p-6
          shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:p-8
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
            onClick={handleInterpret}
            disabled={loading}
            aria-describedby={error ? 'ai-reading-error' : undefined}
            size="sm"
            variant="gold"
          >
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
        <div
          id="ai-reading-error"
          role="alert"
          className="p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm mb-4 border border-misfortune/20"
        >
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
            <>
              <p className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-text-muted not-italic font-sans">
                {DISCLAIMER}
              </p>

              {/* Low-key inbox opt-in inside the reading panel */}
              <div className="mt-4 not-italic font-sans">
                <EmailCapture
                  source="reading"
                  title="Want new self-discovery notes as your chart's cycles turn?"
                  ctaLabel="Keep me posted"
                />
              </div>
            </>
          )}
        </div>
      )}

      {loading && !displayText && (
        <div className="flex items-center justify-center gap-3 text-text-muted py-12">
          <div className="w-5 h-5 border-2 border-star border-t-transparent rounded-full animate-spin" />
          <span>Casting your reading...</span>
        </div>
      )}

        {/* Soul Card share/fission + locked teaser, then the paid paywall */}
        {displayText && !animating && <SoulCard />}
        {displayText && !animating && <FutureReportPaywall />}
      </div>
    </div>
  )
}
