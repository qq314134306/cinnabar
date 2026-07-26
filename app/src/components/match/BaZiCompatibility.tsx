import type { BaziCompatibilityResult } from '@/lib/bazi-compatibility'
import { translateBranch, translateGanZhi, translateStem } from '@/lib/ziwei-glossary'

interface BaZiCompatibilityProps {
  result: BaziCompatibilityResult
}

const PILLAR_LABELS = {
  year: 'Year',
  month: 'Month',
  day: 'Day',
  hour: 'Hour',
} as const

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
        BaZi compatibility · Four Pillars
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
              {label} Four Pillars
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {person.pillars.map((pillar) => (
                <div
                  key={pillar.scope}
                  data-bazi-pillar={pillar.scope}
                  className="min-w-0 rounded-md border border-white/[0.06] bg-black/10 px-1 py-2 text-center"
                >
                  <p className="text-[9px] uppercase tracking-wide text-text-muted">
                    {PILLAR_LABELS[pillar.scope]}
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-text">
                    {translateGanZhi(pillar.ganZhi)}
                  </p>
                </div>
              ))}
            </div>
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

      <section
        aria-labelledby="bazi-stem-relationships-heading"
        className="mt-3 rounded-lg border border-white/[0.07] p-3"
      >
        <h5
          id="bazi-stem-relationships-heading"
          className="text-xs font-medium text-text"
        >
          Visible-stem Ten Gods map
        </h5>
        <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
          Each person's Day Master reads the other person's four visible
          pillar stems. The two directions stay separate.
        </p>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {([
            ['A Day Master reads B', 'B', result.stemRelationships.personAToB],
            ['B Day Master reads A', 'A', result.stemRelationships.personBToA],
          ] as const).map(([heading, targetLabel, relationships]) => (
            <article
              key={heading}
              data-bazi-stem-direction={targetLabel === 'B' ? 'personAToB' : 'personBToA'}
              className="rounded-md bg-white/[0.025] p-2.5"
            >
              <p className="text-[10px] font-medium text-text-secondary">
                {heading}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {relationships.map((relationship) => (
                  <div
                    key={relationship.targetScope}
                    data-bazi-stem-relationship={relationship.relationship}
                    className="rounded bg-black/10 px-2 py-1.5"
                  >
                    <p className="text-[9px] text-text-muted">
                      {targetLabel} {PILLAR_LABELS[relationship.targetScope]} ·{' '}
                      {translateStem(relationship.targetStem)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium text-gold/90">
                      {relationship.label}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="bazi-hidden-stem-relationships-heading"
        className="mt-3 rounded-lg border border-white/[0.07] p-3"
      >
        <h5
          id="bazi-hidden-stem-relationships-heading"
          className="text-xs font-medium text-text"
        >
          Hidden-stem Ten Gods map
        </h5>
        <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
          Each Day Master also reads the stems stored inside the other
          person&apos;s four Earthly Branches. Stems stay in canonical sequence;
          this view assigns no strength weights.
        </p>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {([
            [
              'A Day Master reads B hidden stems',
              'B',
              result.personB,
              result.hiddenStemRelationships.personAToB,
            ],
            [
              'B Day Master reads A hidden stems',
              'A',
              result.personA,
              result.hiddenStemRelationships.personBToA,
            ],
          ] as const).map(([heading, targetLabel, target, relationships]) => (
            <article
              key={heading}
              data-bazi-hidden-stem-direction={
                targetLabel === 'B' ? 'personAToB' : 'personBToA'
              }
              className="rounded-md bg-white/[0.025] p-2.5"
            >
              <p className="text-[10px] font-medium text-text-secondary">
                {heading}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {target.pillars.map((pillar) => (
                  <div
                    key={pillar.scope}
                    className="rounded bg-black/10 px-2 py-1.5"
                  >
                    <p className="text-[9px] text-text-muted">
                      {targetLabel} {PILLAR_LABELS[pillar.scope]} ·{' '}
                      {translateBranch(pillar.branch)}
                    </p>
                    <div className="mt-1 space-y-1">
                      {relationships
                        .filter((item) => item.targetScope === pillar.scope)
                        .map((relationship) => (
                          <p
                            key={`${relationship.targetScope}-${relationship.hiddenStemIndex}`}
                            data-bazi-hidden-stem-relationship={relationship.relationship}
                            className="text-[10px] leading-snug text-gold/90"
                          >
                            {translateStem(relationship.targetStem)} ·{' '}
                            {relationship.label}
                          </p>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="bazi-branch-contacts-heading"
        className="mt-3 rounded-lg border border-white/[0.07] p-3"
      >
        <h5
          id="bazi-branch-contacts-heading"
          className="text-xs font-medium text-text"
        >
          Four-Pillar branch contacts
        </h5>
        <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
          Recognized contacts across all 16 cross-person pillar pairings. Only
          same branch, Liu He, and Liu Chong are listed.
        </p>
        {result.branchContacts.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {result.branchContacts.map((contact) => (
              <article
                key={`${contact.personAScope}-${contact.personBScope}-${contact.kind}`}
                data-bazi-branch-contact={contact.kind}
                className="rounded-md bg-white/[0.025] px-2.5 py-2"
              >
                <p className="text-[10px] text-text-secondary">
                  A {PILLAR_LABELS[contact.personAScope]} ·{' '}
                  {translateBranch(contact.personABranch)} ↔ B{' '}
                  {PILLAR_LABELS[contact.personBScope]} ·{' '}
                  {translateBranch(contact.personBBranch)}
                </p>
                <p className="mt-0.5 text-xs font-medium text-gold/90">
                  {contact.label}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p
            data-bazi-branch-contact-empty
            className="mt-2 text-xs text-text-secondary"
          >
            No same-branch, Liu He, or Liu Chong contact appears across the 16
            pairings.
          </p>
        )}
      </section>

      {result.provisional && (
        <p role="note" className="mt-3 text-xs leading-relaxed text-gold/80">
          At least one entered birth time is approximate. Because a true-solar
          correction may cross a date boundary, treat this Four Pillar comparison
          as provisional until both times are confirmed.
        </p>
      )}

      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-text-muted">
        Ten Gods are directional: A reading B can differ from B reading A. This
        panel shows the complete pillars, directional visible- and hidden-stem
        relationships, and a limited branch-contact map—no score, fate claim,
        or relationship advice.
      </p>
    </section>
  )
}
