import type { BaziCompatibilityResult } from '@/lib/bazi-compatibility'
import { translateGanZhi, translateStem } from '@/lib/ziwei-glossary'

interface BaZiCompatibilityProps {
  result: BaziCompatibilityResult
}

export function BaZiCompatibility({ result }: BaZiCompatibilityProps) {
  return (
    <section
      aria-labelledby="bazi-compatibility-heading"
      className="rounded-xl border border-gold/15 bg-gold/[0.035] p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">
        Cross-method structure
      </p>
      <h4
        id="bazi-compatibility-heading"
        className="mt-1 text-base font-semibold text-text"
      >
        BaZi compatibility · Day Pillars
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        A separate local comparison using the same true-solar-resolved birth
        inputs. It does not change the Zi Wei compatibility score above.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([
          ['Person A', result.personA],
          ['Person B', result.personB],
        ] as const).map(([label, person]) => (
          <article
            key={label}
            data-bazi-compatibility-person={label}
            className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              {label} Day Pillar
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-text">
              {translateGanZhi(person.dayPillar.ganZhi)}
            </p>
            <p className="mt-1 text-xs text-gold/85">
              Day Master · {translateStem(person.dayMaster.stem)}
            </p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {person.dayMaster.polarity} {person.dayMaster.element}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-white/[0.07] p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            A reads B
          </p>
          <p className="mt-1 text-sm font-medium text-gold">
            {result.personAToB.label}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
            {result.personAToB.description}
          </p>
        </article>
        <article className="rounded-lg border border-white/[0.07] p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            B reads A
          </p>
          <p className="mt-1 text-sm font-medium text-gold">
            {result.personBToA.label}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
            {result.personBToA.description}
          </p>
        </article>
        <article
          data-bazi-day-branch-relation={result.dayBranchRelation.kind}
          className="rounded-lg border border-white/[0.07] p-3"
        >
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            Day branch contact
          </p>
          <p className="mt-1 text-sm font-medium text-gold">
            {result.dayBranchRelation.label}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
            {result.dayBranchRelation.description}
          </p>
        </article>
      </div>

      {result.provisional && (
        <p role="note" className="mt-3 text-xs leading-relaxed text-gold/80">
          At least one entered birth time is approximate. Because a true-solar
          correction may cross a date boundary, treat this Day Pillar comparison
          as provisional until both times are confirmed.
        </p>
      )}

      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-text-muted">
        Ten Gods are directional: A reading B can differ from B reading A. This
        panel shows named structure only—no score, fate claim, or relationship
        advice.
      </p>
    </section>
  )
}
