import { useMemo } from 'react'
import { useChartStore } from '@/stores'
import { calculatePeriodScore } from '@/lib/fortune-score'
import { deriveSoulCard, identityLine } from '@/lib/soul-card'

const DIMENSIONS = [
  { key: 'career', label: 'Career' },
  { key: 'wealth', label: 'Wealth' },
  { key: 'relationship', label: 'Relationships' },
  { key: 'health', label: 'Well-being' },
] as const

function scoreLabel(score: number): string {
  if (score >= 80) return 'High momentum'
  if (score >= 65) return 'Supportive rhythm'
  if (score >= 45) return 'Balanced terrain'
  return 'Deliberate pacing'
}

export function LocalChartSnapshot() {
  const chart = useChartStore((state) => state.chart)
  const year = new Date().getFullYear()
  const snapshot = useMemo(() => {
    if (!chart) return null
    const soul = deriveSoulCard(chart)
    return {
      identity: identityLine(soul),
      element: soul.element.name,
      elementColor: soul.element.color,
      keywords: soul.keywords,
      score: calculatePeriodScore(chart, year),
    }
  }, [chart, year])

  if (!snapshot) return null

  return (
    <section
      aria-labelledby="local-chart-snapshot-title"
      className="
        relative overflow-hidden rounded-2xl border border-white/[0.08]
        bg-gradient-to-br from-white/[0.04] to-transparent p-6
        shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:p-8
      "
    >
      <div className="absolute left-1/2 top-0 h-px w-1/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
            Local chart snapshot · {year}
          </p>
          <h2
            id="local-chart-snapshot-title"
            className="mt-2 text-xl font-semibold text-gold lg:text-2xl"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {snapshot.identity}
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            {snapshot.element} emphasis · {snapshot.keywords.join(' · ')}
          </p>
        </div>

        <div className="flex items-end gap-2">
          <span className="font-mono text-5xl font-semibold text-white">
            {snapshot.score.total}
          </span>
          <span className="pb-1 text-sm text-text-muted">/ 100</span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm text-text-secondary">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: snapshot.elementColor }}
        />
        {scoreLabel(snapshot.score.total)} for the current model year
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {DIMENSIONS.map(({ key, label }) => {
          const score = snapshot.score.dimensions[key]
          return (
            <div
              key={key}
              className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-text">{label}</h3>
                <span className="font-mono text-sm text-gold">{score}/100</span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
                className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-star to-gold"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-text-muted">
        This deterministic snapshot is calculated locally from the chart. It is
        a reflective model for self-exploration, not scientific evidence or
        professional advice.
      </p>
    </section>
  )
}
