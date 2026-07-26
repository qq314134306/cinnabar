/**
 * [INPUT]: Depends only on explicit system facts, rule evidence, and bibliographic metadata
 * [OUTPUT]: Provides the passage-level evidence and synthesis contract plus runtime validation
 * [POS]: Provider-independent trust boundary for inspectable claims; never produces readings
 * [PROTOCOL]: Update this header and the evidence contract tests when changed
 */

export type EvidenceAvailability =
  | 'public-domain'
  | 'open-licensed'
  | 'permission-granted'
  | 'metadata-only'
  | 'unavailable'

export type EvidenceLocatorScheme =
  | 'page'
  | 'chapter-section'
  | 'folio'
  | 'canonical-paragraph'
  | 'web-anchor'

export interface SourceEdition {
  id: string
  sourceKind: 'classic' | 'commentary' | 'project-rule' | 'system-record'
  title: string
  originalTitle?: string
  author?: string
  editorOrTranslator?: string
  publisher?: string
  publicationDate?: string
  editionStatement: string
  language: string
  locatorScheme: EvidenceLocatorScheme
  availability: EvidenceAvailability
  license: {
    name: string
    spdxId?: string
    url?: string
  }
  accessUrl?: string
  accessedAt?: string
  rightsNote: string
}

export interface PassageLocator {
  page?: string
  chapter?: string
  section?: string
  paragraph?: string
  line?: string
  folio?: string
  anchor?: string
}

export interface Citation {
  id: string
  sourceEditionId: string
  locator: PassageLocator
  passage: string
  passageLanguage: string
  translation?: string
  note?: string
}

export interface SystemFact {
  id: string
  factType: string
  label: string
  value: string
  derivation: string
  producer: 'deterministic-engine' | 'skill-rule'
  inputReliability: 'verified' | 'approximate' | 'unknown'
  epistemicStatus: 'verified' | 'provisional' | 'candidate-only'
  accessTier: 'free-basic-fact'
}

export interface RuleEvidence {
  id: string
  ruleId: string
  statement: string
  citationIds: string[]
  applicationNote: string
}

export interface Uncertainty {
  id: string
  scope: 'source' | 'locator' | 'translation' | 'fact' | 'rule' | 'synthesis'
  statement: string
  impact: string
  relatedIds: string[]
}

export interface Conflict {
  id: string
  statement: string
  positions: Array<{
    label: string
    claimIds: string[]
    evidenceIds: string[]
  }>
  disposition: 'unresolved' | 'scope-separated' | 'requires-review'
}

interface ClaimBase {
  id: string
  statement: string
  citationIds: string[]
  uncertaintyIds: string[]
  accessTier: 'free-basic-fact' | 'paid-deep-interpretation'
}

export type EvidenceClaim =
  | (ClaimBase & {
      basis: 'system-fact'
      systemFactIds: string[]
      ruleEvidenceIds?: never
    })
  | (ClaimBase & {
      basis: 'rule-evidence'
      ruleEvidenceIds: string[]
      systemFactIds?: never
    })
  | (ClaimBase & {
      basis: 'fact-and-rule'
      systemFactIds: string[]
      ruleEvidenceIds: string[]
    })

export type SynthesisStatus =
  | 'independent-agreement'
  | 'shared-input-agreement'
  | 'conflict'
  | 'insufficient-evidence'

export interface SynthesisAssessment {
  status: SynthesisStatus
  claimIds: string[]
  rationale: string
  independentEvidenceGroups: string[][]
  sharedInputIds: string[]
  conflictIds: string[]
  missingEvidence: string[]
}

export interface EvidenceBundle {
  id: string
  title: string
  productPolicy: {
    audienceLocale: 'en'
    useContext: 'entertainment-and-self-discovery'
    factAuthority: 'deterministic-engine-and-skill-rules'
    narrativeBoundary: 'server-only-from-verified-facts'
    candidateBirthTimePolicy: 'never-overwrite-canonical'
  }
  sourceEditions: SourceEdition[]
  citations: Citation[]
  systemFacts: SystemFact[]
  ruleEvidence: RuleEvidence[]
  claims: EvidenceClaim[]
  uncertainties: Uncertainty[]
  conflicts: Conflict[]
  synthesis: SynthesisAssessment
}

const SYNTHESIS_STATUSES = new Set<SynthesisStatus>([
  'independent-agreement',
  'shared-input-agreement',
  'conflict',
  'insufficient-evidence',
])

const SYNTHESIS_FIELDS = new Set([
  'status',
  'claimIds',
  'rationale',
  'independentEvidenceGroups',
  'sharedInputIds',
  'conflictIds',
  'missingEvidence',
])

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must not be blank`)
}

function requireUniqueIds(items: Array<{ id: string }>, field: string): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    requireText(item.id, `${field}.id`)
    if (ids.has(item.id)) throw new Error(`${field} contains duplicate id ${item.id}`)
    ids.add(item.id)
  }
  return ids
}

function requireReferences(ids: string[], available: Set<string>, field: string): void {
  for (const id of ids) {
    if (!available.has(id)) throw new Error(`${field} references unknown id ${id}`)
  }
}

function hasLocator(locator: PassageLocator): boolean {
  return Object.values(locator).some((value) => typeof value === 'string' && value.trim())
}

function rejectDisallowedPositioning(value: string, field: string): void {
  if (/\b(?:fortune[ -]?telling|psychic|consulting)\b/i.test(value)) {
    throw new Error(`${field} uses disallowed product positioning`)
  }
}

/** Throws when a bundle cannot support an inspectable, score-free synthesis. */
export function assertEvidenceBundle(bundle: EvidenceBundle): void {
  requireText(bundle.id, 'bundle.id')
  requireText(bundle.title, 'bundle.title')
  rejectDisallowedPositioning(bundle.title, 'bundle.title')

  const sourceIds = requireUniqueIds(bundle.sourceEditions, 'sourceEditions')
  const citationIds = requireUniqueIds(bundle.citations, 'citations')
  const factIds = requireUniqueIds(bundle.systemFacts, 'systemFacts')
  const ruleIds = requireUniqueIds(bundle.ruleEvidence, 'ruleEvidence')
  const claimIds = requireUniqueIds(bundle.claims, 'claims')
  const uncertaintyIds = requireUniqueIds(bundle.uncertainties, 'uncertainties')
  const conflictIds = requireUniqueIds(bundle.conflicts, 'conflicts')
  const allEvidenceIds = new Set([...citationIds, ...factIds, ...ruleIds])

  for (const source of bundle.sourceEditions) {
    requireText(source.editionStatement, `source ${source.id}.editionStatement`)
    requireText(source.language, `source ${source.id}.language`)
    requireText(source.license.name, `source ${source.id}.license.name`)
    requireText(source.rightsNote, `source ${source.id}.rightsNote`)
  }

  for (const citation of bundle.citations) {
    requireReferences([citation.sourceEditionId], sourceIds, `citation ${citation.id}`)
    if (!hasLocator(citation.locator)) {
      throw new Error(`citation ${citation.id} requires a passage locator`)
    }
    requireText(citation.passage, `citation ${citation.id}.passage`)
  }


  for (const fact of bundle.systemFacts) {
    rejectDisallowedPositioning(fact.label, `fact ${fact.id}.label`)
    if (fact.factType === 'hour-pillar' && fact.inputReliability !== 'verified') {
      throw new Error(`hour-pillar fact ${fact.id} requires verified birth time`)
    }
    if (fact.factType === 'birth-time-candidate' && fact.epistemicStatus !== 'candidate-only') {
      throw new Error(`birth-time candidate ${fact.id} must remain candidate-only`)
    }
  }

  for (const rule of bundle.ruleEvidence) {
    if (rule.citationIds.length === 0) {
      throw new Error(`rule evidence ${rule.id} requires at least one citation`)
    }
    requireReferences(rule.citationIds, citationIds, `rule evidence ${rule.id}`)
  }

  for (const claim of bundle.claims) {
    requireText(claim.statement, `claim ${claim.id}.statement`)
    rejectDisallowedPositioning(claim.statement, `claim ${claim.id}.statement`)
    requireReferences(claim.citationIds, citationIds, `claim ${claim.id}`)
    requireReferences(claim.uncertaintyIds, uncertaintyIds, `claim ${claim.id}`)
    const facts = claim.systemFactIds ?? []
    const rules = claim.ruleEvidenceIds ?? []
    if (facts.length + rules.length === 0) {
      throw new Error(`claim ${claim.id} requires a system fact or rule evidence`)
    }
    requireReferences(facts, factIds, `claim ${claim.id}`)
    requireReferences(rules, ruleIds, `claim ${claim.id}`)
  }

  for (const uncertainty of bundle.uncertainties) {
    requireReferences(
      uncertainty.relatedIds,
      new Set([...allEvidenceIds, ...claimIds]),
      `uncertainty ${uncertainty.id}`,
    )
  }

  for (const conflict of bundle.conflicts) {
    if (conflict.positions.length < 2) {
      throw new Error(`conflict ${conflict.id} requires at least two positions`)
    }
    for (const position of conflict.positions) {
      requireReferences(position.claimIds, claimIds, `conflict ${conflict.id}`)
      requireReferences(position.evidenceIds, allEvidenceIds, `conflict ${conflict.id}`)
    }
  }

  const synthesis = bundle.synthesis
  for (const field of Object.keys(synthesis)) {
    if (!SYNTHESIS_FIELDS.has(field)) {
      throw new Error(`unsupported synthesis field ${field}; voting and numeric confidence are not permitted`)
    }
  }
  if (!SYNTHESIS_STATUSES.has(synthesis.status)) {
    throw new Error(`unsupported synthesis status ${String(synthesis.status)}`)
  }
  requireReferences(synthesis.claimIds, claimIds, 'synthesis.claimIds')
  requireReferences(synthesis.sharedInputIds, allEvidenceIds, 'synthesis.sharedInputIds')
  requireReferences(synthesis.conflictIds, conflictIds, 'synthesis.conflictIds')
  for (const group of synthesis.independentEvidenceGroups) {
    requireReferences(group, allEvidenceIds, 'synthesis.independentEvidenceGroups')
  }

  if (synthesis.status === 'independent-agreement') {
    if (synthesis.independentEvidenceGroups.length < 2 || synthesis.sharedInputIds.length > 0) {
      throw new Error('independent agreement requires two independent groups and no shared input')
    }
    const seen = new Set<string>()
    for (const group of synthesis.independentEvidenceGroups) {
      if (group.length === 0) throw new Error('independent evidence groups must not be empty')
      for (const id of group) {
        if (seen.has(id)) throw new Error(`independent evidence groups share input ${id}`)
        seen.add(id)
      }
    }
  }
  if (synthesis.status === 'shared-input-agreement' && synthesis.sharedInputIds.length === 0) {
    throw new Error('shared-input agreement requires explicit shared inputs')
  }
  if (synthesis.status === 'conflict' && synthesis.conflictIds.length === 0) {
    throw new Error('conflict synthesis requires an explicit conflict record')
  }
  if (synthesis.status === 'insufficient-evidence' && synthesis.missingEvidence.length === 0) {
    throw new Error('insufficient evidence requires a description of what is missing')
  }
}
