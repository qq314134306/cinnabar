/** Read-only evidence inspector. It does not rank, vote, calculate, or fetch. */
import { assertEvidenceBundle, type EvidenceBundle, type PassageLocator } from '@/lib/evidence-contract'

const STATUS_LABELS = {
  'independent-agreement': 'Independent agreement',
  'shared-input-agreement': 'Shared-input agreement',
  conflict: 'Conflict',
  'insufficient-evidence': 'Insufficient evidence',
} as const

function formatLocator(locator: PassageLocator): string {
  return Object.entries(locator)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ')
}

export interface EvidencePanelProps {
  bundle: EvidenceBundle
}

export function EvidencePanel({ bundle }: EvidencePanelProps) {
  assertEvidenceBundle(bundle)
  const sources = new Map(bundle.sourceEditions.map((source) => [source.id, source]))

  return (
    <section aria-labelledby={`${bundle.id}-title`} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Evidence record · read only</p>
      <h2 id={`${bundle.id}-title`} className="mt-2 text-xl font-semibold text-gold">{bundle.title}</h2>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
        <p className="text-sm font-medium text-text">Synthesis: {STATUS_LABELS[bundle.synthesis.status]}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{bundle.synthesis.rationale}</p>
        {bundle.synthesis.missingEvidence.map((item) => <p key={item} className="mt-2 text-xs text-text-muted">Missing: {item}</p>)}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-text">Claims and basis</h3>
      <ul className="mt-3 space-y-3">
        {bundle.claims.map((claim) => (
          <li key={claim.id} className="rounded-xl border border-white/[0.07] p-4">
            <p className="text-sm text-text">{claim.statement}</p>
            <p className="mt-2 font-mono text-xs text-text-muted">
              Basis: {[...(claim.systemFactIds ?? []), ...(claim.ruleEvidenceIds ?? [])].join(', ')}
            </p>
            <p className="mt-1 text-xs text-text-muted">Access: {claim.accessTier}</p>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold text-text">Passage citations</h3>
      <ol className="mt-3 space-y-3">
        {bundle.citations.map((citation) => {
          const source = sources.get(citation.sourceEditionId)!
          return (
            <li key={citation.id} className="rounded-xl border border-white/[0.07] p-4">
              <blockquote className="text-sm leading-relaxed text-text-secondary">“{citation.passage}”</blockquote>
              <p className="mt-2 text-xs text-text-muted">
                {source.title} · {source.editionStatement} · {formatLocator(citation.locator)}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Availability: {source.availability} · License/rights: {source.license.name} · {source.rightsNote}
              </p>
            </li>
          )
        })}
      </ol>
      <p className="mt-6 border-t border-white/[0.06] pt-4 text-xs text-text-muted">
        For entertainment &amp; self-discovery. Candidate birth times never replace the canonical birth time.
      </p>
    </section>
  )
}
