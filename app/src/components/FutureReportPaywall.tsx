/**
 * Future Report paywall.
 *
 * Checkout requires a signed-in account. PayPal order creation/capture and the
 * authoritative amount live on the server. Verified purchases, generation
 * inputs, and completed reports are restored from the account after refresh or
 * Start Over; report retries reuse the purchase and never recapture payment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useAuthStore,
  useChartStore,
  useContentCacheStore,
  useFutureReportActivityStore,
  useSettingsStore,
} from '@/stores'
import {
  FORECAST_TIER_LABELS,
  PAYWALL_DISCLAIMER,
  type ForecastTier,
} from '@/lib/ai-prompts'
import {
  canRetryFutureReport,
  authContextMatches,
  buildFutureReportRequestInput,
  fetchFutureReportAccess,
  generateFutureReport,
  renderPayPalButtons,
  type FutureReportAuthContext,
  type FutureReportPurchase,
  type FutureReportRequestInput,
  type PayPalCheckoutHandle,
  futureReportPaymentsEnabled,
} from '@/lib/paypal'
import { analytics } from '@/lib/analytics'
import { AuthModal } from '@/components/AuthModal'
import { Button } from '@/components/ui'

/** Display-only prices. The server catalog and DB constraints are authoritative. */
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

type Status = 'idle' | 'checking' | 'generating' | 'error'

function getCurrentChartContextKey(): string | null {
  const birthInfo = useChartStore.getState().birthInfo
  if (!birthInfo || birthInfo.birthTimeUnknown === true) return null
  return JSON.stringify(buildFutureReportRequestInput(
    birthInfo,
    useSettingsStore.getState().persona,
  ))
}

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
    <li className="relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-star/60 before:text-xs">
      {children}
    </li>
  ),
}

export function FutureReportPaywall() {
  const authIdentity = useAuthStore((state) => (
    state.user && state.sessionVersion
      ? `${state.user.id}:${state.sessionVersion}`
      : null
  ))
  const previousAuthIdentity = useRef<string | null>(authIdentity)
  const birthInfo = useChartStore((state) => state.birthInfo)
  const persona = useSettingsStore((state) => state.persona)
  const chartContextKey = useMemo(() => (
    futureReportPaymentsEnabled
      && birthInfo
      && birthInfo.birthTimeUnknown !== true
      ? JSON.stringify(buildFutureReportRequestInput(birthInfo, persona))
      : null
  ), [birthInfo, persona])

  useEffect(() => {
    if (previousAuthIdentity.current !== authIdentity) {
      // The Zustand content cache predates account ownership. Never let a paid
      // report cached for an old owner/session remain readable after a switch.
      useContentCacheStore.getState().setFutureReport(null)
      previousAuthIdentity.current = authIdentity
    }
  }, [authIdentity])

  if (!futureReportPaymentsEnabled || !chartContextKey) return null
  return (
    <EnabledFutureReportPaywall
      key={`${authIdentity ?? 'signed-out'}:${chartContextKey}`}
      chartContextKey={chartContextKey}
    />
  )
}

export function EnabledFutureReportPaywall({
  chartContextKey,
}: {
  chartContextKey: string
}) {
  const { futureReport, setFutureReport } = useContentCacheStore()
  const { user, csrfToken, sessionVersion, initialized } = useAuthStore()
  const beginCapture = useFutureReportActivityStore(
    (state) => state.beginCapture,
  )
  const endCapture = useFutureReportActivityStore((state) => state.endCapture)

  const [status, setStatus] = useState<Status>('idle')
  const [purchase, setPurchase] = useState<FutureReportPurchase | null>(null)
  const [accessCheckedFor, setAccessCheckedFor] = useState<FutureReportAuthContext | null>(null)
  const [currentChartFingerprint, setCurrentChartFingerprint] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paypalLoadError, setPaypalLoadError] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const handles = useRef<Partial<Record<ForecastTier, PayPalCheckoutHandle>>>({})

  const getAuthContext = useCallback((): FutureReportAuthContext | null => {
    const state = useAuthStore.getState()
    return state.user && state.csrfToken && state.sessionVersion
      ? {
          ownerId: state.user.id,
          csrfToken: state.csrfToken,
          sessionVersion: state.sessionVersion,
        }
      : null
  }, [])

  const chartContextMatches = useCallback((expected: string): boolean => (
    getCurrentChartContextKey() === expected
  ), [])

  const buildReportInput = useCallback((): FutureReportRequestInput => {
    if (!chartContextMatches(chartContextKey)) {
      throw new Error(
        'The chart changed before payment verification. Review the new chart and try again.',
      )
    }
    const { chart, birthInfo } = useChartStore.getState()
    if (!chart || !birthInfo) {
      throw new Error('Your chart session expired before payment. Recast it and try again.')
    }
    return buildFutureReportRequestInput(
      birthInfo,
      useSettingsStore.getState().persona,
    )
  }, [chartContextKey, chartContextMatches])

  const cacheReport = useCallback(
    (
      expectedAuth: FutureReportAuthContext,
      expectedChartContext: string,
      paidPurchase: FutureReportPurchase,
      text: string,
    ): boolean => {
      if (
        !authContextMatches(expectedAuth, getAuthContext())
        || !chartContextMatches(expectedChartContext)
      ) return false
      setPurchase({ ...paidPurchase, report: text, generationStatus: 'completed' })
      setFutureReport({
        tier: paidPurchase.tier,
        text,
        orderId: paidPurchase.orderId,
      })
      return true
    },
    [chartContextMatches, getAuthContext, setFutureReport],
  )

  const recoverAccess = useCallback(async () => {
    const expectedAuth = getAuthContext()
    if (!expectedAuth) return
    const expectedChartContext = chartContextKey

    setStatus('checking')
    setReportError(null)
    try {
      const birthInfo = useChartStore.getState().birthInfo
      if (!birthInfo) {
        throw new Error('Recast this chart before restoring its Future Report.')
      }
      const recovered = await fetchFutureReportAccess(
        buildFutureReportRequestInput(
          birthInfo,
          useSettingsStore.getState().persona,
        ),
        expectedAuth.csrfToken,
      )
      if (
        !authContextMatches(expectedAuth, getAuthContext())
        || !chartContextMatches(expectedChartContext)
      ) return
      setCurrentChartFingerprint(recovered.chartFingerprint)
      setPurchase(recovered.purchase)
      if (recovered.purchase?.report) {
        cacheReport(
          expectedAuth,
          expectedChartContext,
          recovered.purchase,
          recovered.purchase.report,
        )
        setNotice('Your paid Future Report was restored from your account.')
      }
      setStatus('idle')
    } catch (error) {
      if (
        !authContextMatches(expectedAuth, getAuthContext())
        || !chartContextMatches(expectedChartContext)
      ) return
      setStatus('error')
      setReportError(
        error instanceof Error
          ? error.message
          : 'We could not check your purchase history. Please try again.',
      )
    }
  }, [
    cacheReport,
    chartContextKey,
    chartContextMatches,
    getAuthContext,
  ])

  const runGeneration = useCallback(
    async (
      paidPurchase: FutureReportPurchase,
      expectedChartContext = chartContextKey,
    ) => {
      const expectedAuth = getAuthContext()
      if (!expectedAuth) {
        setStatus('error')
        setReportError('Your session expired. Please sign in again to restore your purchase.')
        return
      }

      setStatus('generating')
      setReportError(null)
      setNotice(null)
      try {
        const report = await generateFutureReport(
          paidPurchase.purchaseId,
          expectedAuth.csrfToken,
        )
        if (cacheReport(
          expectedAuth,
          expectedChartContext,
          paidPurchase,
          report,
        )) {
          setStatus('idle')
        }
      } catch (error) {
        if (
          !authContextMatches(expectedAuth, getAuthContext())
          || !chartContextMatches(expectedChartContext)
        ) return
        setStatus('error')
        setReportError(
          error instanceof Error
            ? `Your payment is safe, but the report is not ready yet (${error.message}). Retry below — you will not be charged again.`
            : 'Your payment is safe, but the report is not ready yet. Retry below — you will not be charged again.',
        )
      }
    },
    [
      cacheReport,
      chartContextKey,
      chartContextMatches,
      getAuthContext,
    ],
  )

  useEffect(() => {
    analytics.viewPaywall()
  }, [])

  // Purchases and reports live on the server. Re-read them whenever the signed-in
  // identity changes instead of trusting the in-memory content cache.
  useEffect(() => {
    if (!initialized || !csrfToken || !sessionVersion || !user) return

    let cancelled = false
    const expectedAuth = {
      ownerId: user.id,
      csrfToken,
      sessionVersion,
    }
    const expectedChartContext = chartContextKey
    const { chart, birthInfo } = useChartStore.getState()
    if (!chart || !birthInfo) return
    const reportInput = buildFutureReportRequestInput(
      birthInfo,
      useSettingsStore.getState().persona,
    )

    void fetchFutureReportAccess(
      reportInput,
      expectedAuth.csrfToken,
    )
      .then((recovered) => {
        if (
          cancelled
          || !authContextMatches(expectedAuth, getAuthContext())
          || !chartContextMatches(expectedChartContext)
        ) return null
        setCurrentChartFingerprint(recovered.chartFingerprint)
        return {
          recovered: recovered.purchase,
          fingerprint: recovered.chartFingerprint,
        }
      })
      .then((recovered) => {
        if (
          cancelled ||
          !recovered ||
          !authContextMatches(expectedAuth, getAuthContext()) ||
          !chartContextMatches(expectedChartContext)
        ) return
        setPurchase(recovered.recovered)
        if (recovered.recovered?.report) {
          cacheReport(
            expectedAuth,
            expectedChartContext,
            recovered.recovered,
            recovered.recovered.report,
          )
          setNotice('Your paid Future Report was restored from your account.')
        }
        setReportError(null)
        setStatus('idle')
      })
      .catch((error: unknown) => {
        if (
          cancelled
          || !authContextMatches(expectedAuth, getAuthContext())
          || !chartContextMatches(expectedChartContext)
        ) return
        setStatus('error')
        setReportError(
          error instanceof Error
            ? error.message
            : 'We could not check your purchase history. Please try again.',
        )
      })
      .finally(() => {
        if (
          !cancelled
          && authContextMatches(expectedAuth, getAuthContext())
          && chartContextMatches(expectedChartContext)
        ) {
          setAccessCheckedFor(expectedAuth)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    cacheReport,
    chartContextKey,
    chartContextMatches,
    csrfToken,
    getAuthContext,
    initialized,
    sessionVersion,
    user,
  ])

  const currentAuth = user && csrfToken && sessionVersion
    ? { ownerId: user.id, csrfToken, sessionVersion }
    : null
  const activePurchase =
    purchase && purchase.chartFingerprint === currentChartFingerprint
      ? purchase
      : null
  const checkingAccess = Boolean(
    initialized &&
    currentAuth &&
    !authContextMatches(currentAuth, accessCheckedFor),
  )

  useEffect(() => {
    if (
      !user ||
      !csrfToken ||
      !sessionVersion ||
      activePurchase ||
      checkingAccess ||
      status === 'error'
    ) return

    let cancelled = false
    const mounted = handles.current
    const checkoutAuth = {
      ownerId: user.id,
      csrfToken,
      sessionVersion,
    }
    const checkoutChartContext = chartContextKey

    async function mount(tier: ForecastTier) {
      try {
        const handle = await renderPayPalButtons({
          tier,
          userId: checkoutAuth.ownerId,
          containerId: CONTAINER_ID[tier],
          getAuthContext,
          buildReportInput,
          onInitiate: () => {
            analytics.beginCheckout(tier, Number(TIER_PRICES[tier]))
          },
          onCaptureStart: beginCapture,
          onCaptureEnd: endCapture,
          onApprove: (verifiedPurchase) => {
            if (
              cancelled ||
              !authContextMatches(checkoutAuth, getAuthContext()) ||
              !chartContextMatches(checkoutChartContext)
            ) return
            setPurchase(verifiedPurchase)
            setCurrentChartFingerprint(verifiedPurchase.chartFingerprint)
            setNotice('Payment verified. Your report can now be generated without another charge.')
            analytics.purchaseSuccess({
              tier: verifiedPurchase.tier,
              value: verifiedPurchase.amountMinor / 100,
              transactionId: verifiedPurchase.orderId,
            })
            void runGeneration(verifiedPurchase, checkoutChartContext)
          },
          onCancel: () => {
            if (
              !authContextMatches(checkoutAuth, getAuthContext())
              || !chartContextMatches(checkoutChartContext)
            ) return
            setNotice('Checkout cancelled — no charge was made. You can try again anytime.')
          },
          onError: (error) => {
            if (
              !authContextMatches(checkoutAuth, getAuthContext())
              || !chartContextMatches(checkoutChartContext)
            ) return
            setStatus('error')
            setReportError(
              `${error.message || 'Payment could not be confirmed.'} If you approved PayPal, use “Restore purchase” before trying a new checkout.`,
            )
          },
        })
        if (cancelled) handle.close()
        else mounted[tier] = handle
      } catch (error) {
        if (!cancelled) {
          setPaypalLoadError(
            error instanceof Error
              ? error.message
              : 'PayPal checkout is unavailable right now.',
          )
        }
      }
    }

    void mount('1-year')
    void mount('5-year')

    return () => {
      cancelled = true
      for (const handle of Object.values(mounted)) handle?.close()
      handles.current = {}
    }
  }, [
    buildReportInput,
    beginCapture,
    chartContextKey,
    chartContextMatches,
    getAuthContext,
    endCapture,
    activePurchase,
    checkingAccess,
    runGeneration,
    csrfToken,
    sessionVersion,
    status,
    user,
  ])

  const busy = checkingAccess || status === 'checking' || status === 'generating'
  const displayedReport = activePurchase?.report ?? (
    activePurchase && futureReport?.orderId === activePurchase.orderId
      ? futureReport.text
      : ''
  )
  const retryAvailable = canRetryFutureReport(activePurchase)

  return (
    <div className="mt-8 space-y-6">
      {activePurchase && (
        <div
          id="cinnabar-future-report"
          className="
            relative p-6 lg:p-8 rounded-2xl
            border border-gold/30 bg-gradient-to-br from-gold/[0.06] to-transparent
            backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]
          "
        >
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <h3
              className="text-lg lg:text-xl font-semibold text-gold flex items-center gap-2"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {status === 'generating' ? (
                <>
                  <span className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  Generating your Future Report...
                </>
              ) : (
                <>✓ Purchase verified — Your Future Report</>
              )}
            </h3>
            {displayedReport && status !== 'generating' && (
              <Button
                size="sm"
                variant="secondary"
                className="print:hidden"
                onClick={() => window.print()}
              >
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

          {!displayedReport && status !== 'generating' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Your payment is attached to your account. Generate or retry this report
                without returning to PayPal.
              </p>
              {retryAvailable && (
                <Button
                  size="sm"
                  variant="gold"
                  onClick={() => void runGeneration(
                    activePurchase,
                    chartContextKey,
                  )}
                >
                  Generate / Retry report
                </Button>
              )}
            </div>
          )}

          {displayedReport && status !== 'generating' && (
            <p className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-text-muted not-italic font-sans">
              {PAYWALL_DISCLAIMER}
            </p>
          )}
        </div>
      )}

      {reportError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20"
        >
          {reportError}
          {user && (
            <button
              type="button"
              onClick={() => void recoverAccess()}
              className="ml-2 underline underline-offset-2 font-medium"
            >
              Restore purchase
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-lg bg-white/[0.04] text-text-secondary text-sm border border-white/[0.08]">
          {notice}
        </div>
      )}

      {!activePurchase && (
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

          {!initialized || checkingAccess || status === 'checking' ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
              <span className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              Checking your purchase history...
            </div>
          ) : !user || !currentAuth ? (
            <div className="text-center py-6">
              <p className="text-sm text-text-secondary mb-4">
                Sign in before checkout so a paid report can be restored after a refresh,
                device change, or Start Over.
              </p>
              <Button variant="gold" onClick={() => setShowAuthModal(true)}>
                Sign in to continue
              </Button>
            </div>
          ) : (
            <>
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
                    <h4 className="text-base font-semibold text-text mb-1">
                      {FORECAST_TIER_LABELS[tier]}
                    </h4>
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
                          <span className="text-gold mt-0.5">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div id={CONTAINER_ID[tier]} className="min-h-[45px]" />
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="mt-6 text-center text-xs text-text-muted">{PAYWALL_DISCLAIMER}</p>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
