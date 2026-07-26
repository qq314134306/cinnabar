import { lazy, useCallback, useMemo, useRef, useState } from 'react'
import { useChartStore } from '@/stores'
import { LazySurface } from '@/components/LazySurface'
import {
  buildBirthTimeSensitivity,
  type BirthTimeScenarioPosition,
} from '@/lib/birth-time-sensitivity'
import { hourToShichen } from '@/lib/shichen'
import {
  describeStarLabel,
  translateBranch,
  translateFiveElementsClass,
  translateShichen,
} from '@/lib/ziwei-glossary'

const POSITION_LABELS: Record<BirthTimeScenarioPosition, string> = {
  earlier: 'Earlier window',
  selected: 'Chart used',
  later: 'Later window',
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const BirthTimeFinder = lazy(async () => {
  const module = await import('./BirthTimeFinder')
  return { default: module.BirthTimeFinder }
})

function formatDate(year: number, month: number, day: number): string {
  return DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)))
}

export function BirthTimeSensitivity() {
  const { chart, birthInfo } = useChartStore()
  const [retryVersion, setRetryVersion] = useState(0)
  const [finderOpen, setFinderOpen] = useState(false)
  const finderButtonRef = useRef<HTMLButtonElement | null>(null)
  const timeUnknown = birthInfo?.birthTimeUnknown === true

  const buildState = useMemo(() => {
    if (!chart || !birthInfo || birthInfo.birthTimeReliable !== false) {
      return { result: null, failed: false, attempt: retryVersion }
    }
    if (birthInfo.birthTimeUnknown === true) {
      return { result: null, failed: false, attempt: retryVersion }
    }

    try {
      return {
        result: buildBirthTimeSensitivity(chart, birthInfo),
        failed: false,
        attempt: retryVersion,
      }
    } catch {
      return { result: null, failed: true, attempt: retryVersion }
    }
  }, [birthInfo, chart, retryVersion])

  const closeFinder = useCallback(() => {
    setFinderOpen(false)
    window.setTimeout(() => finderButtonRef.current?.focus(), 0)
  }, [])

  if (!chart || !birthInfo || birthInfo.birthTimeReliable !== false) {
    return null
  }

  return (
    <section
      aria-labelledby="birth-time-sensitivity-title"
      className="
        mt-4 rounded-xl border border-gold/20 bg-gold/[0.04] p-4 lg:p-5
      "
    >
      <div className="max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">
          {timeUnknown ? 'Unknown birth time' : 'Approximate birth time'}
        </p>
        <h3
          id="birth-time-sensitivity-title"
          className="mt-1 text-base font-semibold text-text lg:text-lg"
        >
          {timeUnknown
            ? 'Start With All 13 Time Blocks'
            : 'Birth-Time Sensitivity Check'}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {timeUnknown
            ? 'No birth hour was supplied. Noon exists only as an internal engine placeholder and is not displayed as your chart; use the all-block comparison before treating hour-based structure as meaningful.'
            : 'Your time was marked approximate. These three local calculations compare the neighboring traditional two-hour windows; they do not identify or rectify your exact birth time.'}
        </p>
      </div>

      {!timeUnknown && buildState.failed ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-misfortune/20 bg-misfortune/10 p-3"
        >
          <p className="text-sm text-misfortune">
            We couldn&apos;t build this comparison. Your main chart above is
            unchanged.
          </p>
          <button
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
            className="
              mt-3 rounded-lg border border-misfortune/30 px-3 py-1.5
              text-sm text-text transition-colors hover:bg-white/[0.05]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
            "
          >
            Retry time comparison
          </button>
        </div>
      ) : timeUnknown || buildState.result ? (
        <>
          {timeUnknown && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-gold/20 bg-gold/[0.07] px-3 py-2.5 text-sm leading-relaxed text-text-secondary"
            >
              No placeholder chart is shown. Cinnabar will independently
              true-solar-resolve every civil candidate after an exact
              birthplace is entered below.
            </p>
          )}
          {!timeUnknown && buildState.result && (
            <>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {buildState.result.scenarios.map((scenario) => {
              const stars = scenario.lifePalace?.majorStars.map(
                describeStarLabel,
              ) ?? []
              const correctionLabel = scenario.resolved.applied
                ? translateShichen(scenario.resolved.correctedShichen)
                : null

              return (
                <article
                  key={scenario.position}
                  aria-labelledby={`birth-time-${scenario.position}-title`}
                  className={`
                    rounded-xl border p-3
                    ${scenario.position === 'selected'
                      ? 'border-gold/35 bg-gold/[0.08]'
                      : 'border-white/[0.07] bg-white/[0.025]'
                    }
                  `}
                >
                  <h4
                    id={`birth-time-${scenario.position}-title`}
                    className="text-sm font-medium text-gold"
                  >
                    {POSITION_LABELS[scenario.position]}
                  </h4>
                  <p className="mt-1 text-sm text-text">
                    {hourToShichen(scenario.input.hour)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {formatDate(
                      scenario.input.year,
                      scenario.input.month,
                      scenario.input.day,
                    )}
                  </p>
                  {correctionLabel && (
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">
                      Solar-corrected chart: {correctionLabel}
                      {scenario.resolved.crossedDate
                        ? ` · ${formatDate(
                            scenario.resolved.year,
                            scenario.resolved.month,
                            scenario.resolved.day,
                          )}`
                        : ''}
                    </p>
                  )}

                  <dl className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 text-xs">
                    <div>
                      <dt className="text-text-muted">Life Palace</dt>
                      <dd className="mt-0.5 text-text-secondary">
                        {scenario.lifePalace
                          ? `${translateBranch(scenario.lifePalace.branch)} · ${
                              stars.length > 0
                                ? stars.join(' + ')
                                : 'No major star'
                            }`
                          : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Body Palace</dt>
                      <dd className="mt-0.5 text-text-secondary">
                        {scenario.bodyPalace
                          ? translateBranch(scenario.bodyPalace.branch)
                          : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Element class</dt>
                      <dd className="mt-0.5 text-text-secondary">
                        {translateFiveElementsClass(
                          scenario.fiveElementsClass,
                        ) || 'Unavailable'}
                      </dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>

          <p
            role="status"
            className="
              mt-4 rounded-lg border border-white/[0.07] bg-black/10
              px-3 py-2.5 text-sm leading-relaxed text-text-secondary
            "
          >
            {buildState.result.hasStructuralDifferences
              ? 'The neighboring windows change at least one core chart structure. Treat each as a possibility; this comparison does not determine the correct birth time.'
              : 'The neighboring windows keep the displayed core structure stable. Other chart details may still differ; this comparison does not determine the correct birth time.'}
          </p>
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5 text-sm text-text-secondary">
            <p className="font-medium text-text">Suppressed while time is uncertain</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-text-muted">
              {buildState.result.suppressedConclusions.map((conclusion) => (
                <li key={conclusion}>{conclusion}</li>
              ))}
            </ul>
          </div>
            </>
          )}

          <div className="mt-4">
            <button
              ref={finderButtonRef}
              type="button"
              aria-expanded={finderOpen}
              aria-controls="birth-time-finder"
              onClick={() => {
                if (finderOpen) {
                  closeFinder()
                } else {
                  setFinderOpen(true)
                }
              }}
              className="rounded-lg border border-star/30 bg-star/[0.08] px-4 py-2 text-sm font-medium text-star-light transition-colors hover:bg-star/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finderOpen
                ? 'Hide life-event comparison'
                : 'Explore all time blocks with life events'}
            </button>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Compare all 13 civil-time entries with optional rough recall and
              up to five past-event questions. Everything stays on this device.
            </p>
          </div>

          {finderOpen && (
            <LazySurface
              label="the birth-time shortlist"
              loadingLabel="Loading the birth-time shortlist…"
              variant="panel"
            >
              <BirthTimeFinder
                birthInfo={birthInfo}
                onClose={closeFinder}
              />
            </LazySurface>
          )}
        </>
      ) : null}
    </section>
  )
}
