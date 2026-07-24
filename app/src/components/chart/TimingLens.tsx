import { useEffect, useMemo, useState } from 'react'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import {
  NATAL_TRANSFORMATION_ORDER,
  type NatalTransformationCode,
} from '@/lib/chart-transformations'
import {
  buildTimingLens,
  type TimingLensPalaceReference,
  type TimingLensPeriod,
  type TimingLensTransformation,
} from '@/lib/timing-lens'
import {
  translateBranch,
  translateGanZhi,
  translateMutagen,
  translatePalaceName,
  translateStarLabel,
} from '@/lib/ziwei-glossary'

const MODEL_AGE_LIMIT = 100

interface TimingLensProps {
  chart: FunctionalAstrolabe
  birthInfo: BirthInfo
  onSelectPalace: (palaceName: string) => void
  onContextChange: () => void
}

interface TimingTransformationGridProps {
  idPrefix: string
  scopeLabel: string
  transformations: TimingLensTransformation[]
  onSelectPalace: (palaceName: string) => void
}

function palaceDetail(palace: TimingLensPalaceReference): string {
  const branch = palace.branch ? ` · ${translateBranch(palace.branch)}` : ''
  return `${translatePalaceName(palace.name)}${branch}`
}

function TimingTransformationGrid({
  idPrefix,
  scopeLabel,
  transformations,
  onSelectPalace,
}: TimingTransformationGridProps) {
  const styles: Record<NatalTransformationCode, string> = {
    '禄': 'border-fortune/25 bg-fortune/[0.05] text-fortune',
    '权': 'border-gold/25 bg-gold/[0.05] text-gold',
    '科': 'border-star/25 bg-star/[0.05] text-star-light',
    '忌': 'border-misfortune/25 bg-misfortune/[0.05] text-misfortune',
  }

  return (
    <div
      aria-labelledby={`${idPrefix}-transformations-heading`}
      className="mt-3"
    >
      <h5
        id={`${idPrefix}-transformations-heading`}
        className="text-xs font-medium text-text-secondary"
      >
        Four Transformations
      </h5>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {NATAL_TRANSFORMATION_ORDER.map((code) => {
          const transformation = transformations.find(
            (item) => item.code === code,
          )
          const info = translateMutagen(code)

          if (!transformation) {
            return (
              <div
                key={code}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
              >
                <p className="text-xs font-medium text-text-muted">
                  {info?.code ?? code}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  Not available
                </p>
              </div>
            )
          }

          const starLabel = translateStarLabel(transformation.starName)
          const hostPalace = transformation.hostPalace
          if (!hostPalace) {
            return (
              <div
                key={code}
                className={`rounded-lg border p-2.5 ${styles[code]}`}
              >
                <p className="text-xs font-semibold">{info?.code ?? code}</p>
                <p className="mt-1 text-xs text-text">{starLabel}</p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Natal host unavailable
                </p>
              </div>
            )
          }

          const palaceLabel = translatePalaceName(
            hostPalace.name,
          )

          return (
            <button
              key={code}
              type="button"
              aria-label={`Open ${scopeLabel} ${info?.code ?? code} transformation on ${starLabel} in ${palaceLabel}`}
              onClick={() => onSelectPalace(hostPalace.name)}
              className={`
                rounded-lg border p-2.5 text-left transition-colors
                hover:bg-white/[0.08]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
                ${styles[code]}
              `}
            >
              <span className="block text-xs font-semibold">
                {info?.code ?? code}
              </span>
              <span className="mt-1 block text-xs text-text">
                {starLabel}
              </span>
              <span className="mt-0.5 block text-[11px] text-text-secondary">
                {palaceDetail(hostPalace)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface TimingPeriodCardProps {
  idPrefix: string
  title: string
  subtitle: string
  period: TimingLensPeriod
  onSelectPalace: (palaceName: string) => void
}

function TimingPeriodCard({
  idPrefix,
  title,
  subtitle,
  period,
  onSelectPalace,
}: TimingPeriodCardProps) {
  const lifePalaceHost = period.lifePalaceHost

  return (
    <article
      aria-labelledby={`${idPrefix}-heading`}
      className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
    >
      <h4
        id={`${idPrefix}-heading`}
        className="text-sm font-semibold text-text"
      >
        {title}
      </h4>
      <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>

      <div className="mt-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Life Palace position
        </p>
        {lifePalaceHost ? (
          <button
            type="button"
            aria-label={`Open ${title} Life Palace in ${translatePalaceName(lifePalaceHost.name)}`}
            onClick={() => onSelectPalace(lifePalaceHost.name)}
            className="
              mt-1 rounded-md text-left text-sm font-medium text-gold
              underline decoration-gold/30 underline-offset-4
              hover:text-gold-light
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
            "
          >
            Natal {palaceDetail(lifePalaceHost)}
          </button>
        ) : (
          <p className="mt-1 text-sm text-text-muted">Not available</p>
        )}
      </div>

      <TimingTransformationGrid
        idPrefix={idPrefix}
        scopeLabel={title}
        transformations={period.transformations}
        onSelectPalace={onSelectPalace}
      />
    </article>
  )
}

export function TimingLens({
  chart,
  birthInfo,
  onSelectPalace,
  onContextChange,
}: TimingLensProps) {
  const firstYear = birthInfo.year
  const lastYear = birthInfo.year + MODEL_AGE_LIMIT - 1
  const defaultYear = Math.min(
    lastYear,
    Math.max(firstYear, new Date().getFullYear()),
  )
  const [year, setYear] = useState(defaultYear)

  useEffect(() => {
    setYear(defaultYear)
  }, [defaultYear])

  const yearOptions = useMemo(() => (
    Array.from({ length: MODEL_AGE_LIMIT }, (_, index) => {
      const optionYear = firstYear + index
      return {
        year: optionYear,
        age: index + 1,
      }
    })
  ), [firstYear])

  const lens = useMemo(() => {
    try {
      return buildTimingLens(chart, birthInfo.year, year)
    } catch {
      return null
    }
  }, [birthInfo.year, chart, year])

  const selectYear = (nextYear: number) => {
    if (nextYear === year || nextYear < firstYear || nextYear > lastYear) return
    onContextChange()
    setYear(nextYear)
  }

  return (
    <section
      aria-labelledby="timing-lens-heading"
      className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 lg:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h3
            id="timing-lens-heading"
            className="text-sm font-semibold text-text"
          >
            Major Limit &amp; Year Lens
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Layer one 10-year Major Limit and annual Life Palace/Four
            Transformations onto the natal chart. This is structural
            navigation only; the 1–100 model does not predict outcomes or
            lifespan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous timing lens year"
            disabled={year <= firstYear}
            onClick={() => selectYear(year - 1)}
            className="
              rounded-md border border-white/10 px-2.5 py-2 text-xs text-text
              hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
            "
          >
            Previous
          </button>
          <label className="sr-only" htmlFor="timing-lens-year">
            Timing lens year
          </label>
          <select
            id="timing-lens-year"
            aria-label="Timing lens year"
            value={year}
            onChange={(event) => selectYear(Number(event.target.value))}
            className="
              rounded-md border border-white/10 bg-night px-2.5 py-2 text-xs text-text
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
            "
          >
            {yearOptions.map((option) => (
              <option key={option.year} value={option.year}>
                {option.year} · Age {option.age}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Next timing lens year"
            disabled={year >= lastYear}
            onClick={() => selectYear(year + 1)}
            className="
              rounded-md border border-white/10 px-2.5 py-2 text-xs text-text
              hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
            "
          >
            Next
          </button>
        </div>
      </div>

      {!lens ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-text-muted"
        >
          Timing structure is unavailable for this model year.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-text-secondary" aria-live="polite">
            {lens.year} · Model age {lens.age}
          </p>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <TimingPeriodCard
              idPrefix="major-limit"
              title="Major Limit"
              subtitle={[
                lens.majorLimit.range
                  ? `Ages ${lens.majorLimit.range[0]}–${lens.majorLimit.range[1]}`
                  : 'No active 10-year range',
                lens.majorLimit.ganZhi
                  ? translateGanZhi(lens.majorLimit.ganZhi)
                  : '',
              ].filter(Boolean).join(' · ')}
              period={lens.majorLimit}
              onSelectPalace={onSelectPalace}
            />
            <TimingPeriodCard
              idPrefix="annual"
              title={`Annual ${lens.year}`}
              subtitle={lens.annual.ganZhi
                ? `${translateGanZhi(lens.annual.ganZhi)} year`
                : 'Year stem-branch unavailable'}
              period={lens.annual}
              onSelectPalace={onSelectPalace}
            />
          </div>
        </>
      )}
    </section>
  )
}
