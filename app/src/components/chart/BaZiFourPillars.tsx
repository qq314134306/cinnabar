import type { BirthInfo } from '@/lib/astro'
import { buildBaziFourPillars } from '@/lib/bazi-four-pillars'
import {
  BRANCH_EN,
  STEM_EN,
  translateGanZhi,
  translateStem,
} from '@/lib/ziwei-glossary'

interface BaZiFourPillarsProps {
  birthInfo: BirthInfo
}

const PILLAR_LABELS = {
  year: 'Year',
  month: 'Month',
  day: 'Day',
  hour: 'Hour',
} as const

export function BaZiFourPillars({ birthInfo }: BaZiFourPillarsProps) {
  const resolved = birthInfo.resolvedBirthTime
  const result = resolved
    ? buildBaziFourPillars({
        year: resolved.year,
        month: resolved.month,
        day: resolved.day,
        timeIndex: resolved.timeIndex,
      })
    : null

  if (!result) return null

  const dayMasterGloss = STEM_EN[result.dayMaster.stem]

  return (
    <section
      aria-labelledby="bazi-four-pillars-heading"
      className="mt-4 border-t border-white/[0.08] pt-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">
            Cross-method structure
          </p>
          <h3
            id="bazi-four-pillars-heading"
            className="mt-1 text-sm font-semibold text-text"
          >
            BaZi · Four Pillars
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-secondary">
            Calculated locally from the same corrected birth date and two-hour
            block. The Year Pillar uses the Li Chun boundary; the Month Pillar
            follows solar-term boundaries.
          </p>
        </div>
        <div
          data-bazi-day-master
          className="rounded-lg border border-gold/20 bg-gold/[0.06] px-3 py-2"
        >
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            Day Master
          </p>
          <p className="mt-0.5 text-sm font-medium text-gold">
            {translateStem(result.dayMaster.stem)}
            <span className="text-text-secondary">
              {' · '}
              {result.dayMaster.polarity} {result.dayMaster.element}
            </span>
          </p>
          {dayMasterGloss && (
            <p className="mt-0.5 text-[10px] text-text-muted">
              {dayMasterGloss.archetype}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {result.pillars.map((pillar) => {
          const branchGloss = BRANCH_EN[pillar.branch]
          const isDayPillar = pillar.scope === 'day'

          return (
            <article
              key={pillar.scope}
              data-bazi-pillar={pillar.scope}
              className={`
                rounded-lg border p-3
                ${isDayPillar
                  ? 'border-gold/25 bg-gold/[0.06]'
                  : 'border-white/[0.07] bg-white/[0.025]'}
              `}
            >
              <p className="text-[10px] uppercase tracking-wider text-text-muted">
                {PILLAR_LABELS[pillar.scope]} Pillar
              </p>
              <h4 className="mt-1 font-mono text-base font-semibold text-text">
                {translateGanZhi(pillar.ganZhi)}
              </h4>
              <p className="mt-1 text-xs text-text-secondary">
                {pillar.polarity} {pillar.element} stem
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                {branchGloss
                  ? `${branchGloss.pinyin} · ${branchGloss.zodiac}`
                  : pillar.branch}
              </p>
              {isDayPillar && (
                <span className="mt-2 inline-flex rounded-full bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                  Day Master source
                </span>
              )}
            </article>
          )
        })}
      </div>

      {birthInfo.birthTimeReliable === false && (
        <p role="note" className="mt-2 text-xs leading-relaxed text-gold/80">
          The Hour Pillar is provisional because the entered birth time is
          approximate. Use the birth-time comparison before treating it as
          stable.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
        This is a structural companion to the Zi Wei chart, not a prediction
        or a complete BaZi interpretation.
      </p>
    </section>
  )
}
