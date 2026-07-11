/* ============================================================
   Future Report paywall — sits below the free reading.
   Two PayPal-checkout tiers (1-Year / 5-Year), then streams a
   persona-aware paid reading from the same /api/interpret proxy.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChartStore, useContentCacheStore, useSettingsStore } from '@/stores'
import { buildYearlyChartFacts, buildZiWeiChartFacts } from '@/lib/chart-facts'
import {
  buildFutureReportPrompt,
  buildSystemPrompt,
  forecastYears,
  FORECAST_TIER_LABELS,
  PAYWALL_DISCLAIMER,
  type ForecastTier,
} from '@/lib/ai-prompts'
import { streamChat, type ChatMessage } from '@/lib/llm'
import { renderPayPalButtons, type PayPalCheckoutHandle } from '@/lib/paypal'
import { Button } from '@/components/ui'

const TIER_PRICES: Record<ForecastTier, string> = {
  '1-year': '9.90',
  '5-year': '14.90',
}

const TIER_FEATURES: Record<ForecastTier, string[]> = {
  '1-year': [
    'This year and next year, mapped in detail',
    'Career, wealth & love timing',
    'Grounded in your real chart',
  ],
  '5-year': [
    'This year plus the next four, year by year',
    'Your full current Luck Cycle, framed',
    'Career, wealth & love timing',
    'Practical guidance & best windows',
  ],
}

const CONTAINER_ID: Record<ForecastTier, string> = {
  '1-year': 'cinnabar-paypal-1-year',
  '5-year': 'cinnabar-paypal-5-year',
}

const FIVE_YEAR_PER_YEAR = (Number(TIER_PRICES['5-year']) / 5).toFixed(2)

type Status = 'idle' | 'generating' | 'error'

/* ------------------------------------------------------------
   Markdown styling (matches the free-reading panel)
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
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="relative pl-4 before:content-['◆'] before:absolute before:left-0 before:text-star/60 before:text-xs">
      {children}
    </li>
  ),
}

export function FutureReportPaywall() {
  const { futureReport, setFutureReport } = useContentCacheStore()

  const [status, setStatus] = useState<Status>('idle')
  const [reportDraft, setReportDraft] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paypalLoadError, setPaypalLoadError] = useState<string | null>(null)

  const handles = useRef<Partial<Record<ForecastTier, PayPalCheckoutHandle>>>({})

  const generateReport = useCallback(async (tier: ForecastTier, orderId: string) => {
    const { chart, birthInfo } = useChartStore.getState()
    if (!chart || !birthInfo) {
      setStatus('error')
      setReportError('Your chart session expired — please recast your chart, then contact us with your payment confirmation and we will make it right.')
      return
    }

    setNotice(null)
    setReportError(null)
    setStatus('generating')
    setReportDraft('')

    try {
      const persona = useSettingsStore.getState().persona
      const chartFacts = buildZiWeiChartFacts(chart, birthInfo)
      const years = forecastYears(tier, new Date().getFullYear())
      const yearlyFacts = buildYearlyChartFacts(chart, birthInfo, years)

      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(persona) },
        { role: 'user', content: buildFutureReportPrompt(chartFacts, yearlyFacts, tier) },
      ]

      let fullText = ''
      for await (const token of streamChat(messages)) {
        fullText += token
        setReportDraft(fullText)
      }

      setFutureReport({ tier, text: fullText, orderId })
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setReportError(
        err instanceof Error
          ? `Your payment was completed, but we couldn't generate your report yet (${err.message}). Please try again — no additional charge.`
          : "Your payment was completed, but we couldn't generate your report yet. Please try again — no additional charge."
      )
    }
  }, [setFutureReport])

  useEffect(() => {
    let cancelled = false
    const mounted = handles.current

    async function mount(tier: ForecastTier) {
      try {
        const handle = await renderPayPalButtons({
          amount: TIER_PRICES[tier],
          containerId: CONTAINER_ID[tier],
          onApprove: (details) => {
            setNotice(null)
            void generateReport(tier, details.id)
          },
          onCancel: () => {
            setNotice('Checkout cancelled — no charge was made. You can try again anytime.')
          },
          onError: (err) => {
            setStatus('error')
            setReportError(err.message || 'Payment failed. Please try again.')
          },
        })
        if (cancelled) handle.close()
        else mounted[tier] = handle
      } catch (err) {
        if (!cancelled) {
          setPaypalLoadError(err instanceof Error ? err.message : 'PayPal checkout is unavailable right now.')
        }
      }
    }

    void mount('1-year')
    void mount('5-year')

    return () => {
      cancelled = true
      for (const handle of Object.values(mounted)) handle?.close()
    }
  }, [generateReport])

  const busy = status === 'generating'
  const displayedReport = futureReport?.text ?? reportDraft
  const showReportPanel = Boolean(futureReport) || busy

  return (
    <div className="mt-8 space-y-6">
      {showReportPanel && (
        <div
          id="cinnabar-future-report"
          className="
            relative p-6 lg:p-8 rounded-2xl
            border border-gold/30 bg-gradient-to-br from-gold/[0.06] to-transparent
            backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]
          "
        >
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg lg:text-xl font-semibold text-gold flex items-center gap-2" style={{ fontFamily: 'var(--font-serif)' }}>
              {busy ? (
                <>
                  <span className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  Generating your Future Report...
                </>
              ) : (
                <>✓ Purchase confirmed — Your Future Report</>
              )}
            </h3>
            {futureReport && !busy && (
              <Button size="sm" variant="secondary" className="print:hidden" onClick={() => window.print()}>
                Print / Save
              </Button>
            )}
          </div>

          {displayedReport && (
            <div
              className="prose prose-invert max-w-none text-text-secondary text-base lg:text-lg leading-relaxed"
              style={{ fontFamily: 'var(--font-brush)' }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                {displayedReport}
              </ReactMarkdown>
            </div>
          )}

          {futureReport && !busy && (
            <p className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-text-muted not-italic font-sans">
              {PAYWALL_DISCLAIMER}
            </p>
          )}
        </div>
      )}

      {reportError && (
        <div className="p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20">
          {reportError}
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-lg bg-white/[0.04] text-text-secondary text-sm border border-white/[0.08]">
          {notice}
        </div>
      )}

      <div
        className="
          relative p-6 lg:p-8 rounded-2xl
          bg-gradient-to-br from-white/[0.03] to-transparent
          backdrop-blur-xl border border-white/[0.08]
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        <div className="text-center mb-6">
          <h3
            className="text-xl lg:text-2xl font-semibold text-text mb-2"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Unlock Your Future Report
          </h3>
          <p className="text-text-muted text-sm max-w-xl mx-auto">
            This is who you've been. Your chart also holds what's coming — mapped year by year.
          </p>
        </div>

        {paypalLoadError && (
          <div className="mb-4 p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20 text-center">
            {paypalLoadError}
          </div>
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {(['1-year', '5-year'] as const).map((tier) => (
            <div
              key={tier}
              className={`
                relative p-5 rounded-xl border
                ${tier === '5-year'
                  ? 'border-gold/50 bg-gold/[0.04] shadow-[0_0_30px_rgba(201,162,75,0.12)]'
                  : 'border-white/[0.08] bg-white/[0.02]'
                }
              `}
            >
              {tier === '5-year' && (
                <span
                  className="
                    absolute -top-3 left-1/2 -translate-x-1/2
                    px-3 py-0.5 rounded-full text-[11px] font-semibold tracking-wide
                    bg-gold text-night
                  "
                >
                  MOST POPULAR
                </span>
              )}
              <h4 className="text-base font-semibold text-text mb-1">{FORECAST_TIER_LABELS[tier]}</h4>
              <p
                className={`text-3xl font-bold ${tier === '5-year' ? 'text-gold mb-1' : 'text-text mb-3'}`}
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                ${TIER_PRICES[tier]}
              </p>
              {tier === '5-year' && (
                <p className="text-xs font-medium text-gold/80 mb-3">
                  just ${FIVE_YEAR_PER_YEAR}/year — best value
                </p>
              )}
              <ul className="space-y-1.5 mb-4 text-sm text-text-secondary">
                {TIER_FEATURES[tier].map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-gold mt-0.5">✦</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div id={CONTAINER_ID[tier]} className="min-h-[45px]" />
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">{PAYWALL_DISCLAIMER}</p>
      </div>
    </div>
  )
}
