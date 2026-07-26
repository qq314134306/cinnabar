/** Verified, synthetic fixtures: no copyrighted corpus text is embedded here. */
import type { EvidenceBundle, SynthesisStatus } from './evidence-contract'

const base: EvidenceBundle = {
  id: 'fixture.passage-evidence',
  title: 'Passage evidence contract example',
  productPolicy: {
    audienceLocale: 'en',
    useContext: 'entertainment-and-self-discovery',
    factAuthority: 'local-deterministic-engine',
    skillRole: 'rule-constraints-and-anonymous-dev-validation',
    externalValidation: 'anonymous-fixed-fixtures-only-fail-closed',
    narrativeBoundary: 'server-only-rendering-no-fact-mutation',
    candidateBirthTimePolicy: 'never-overwrite-canonical',
    profilePersistence: 'explicit-user-save-only',
  },
  sourceEditions: [
    {
      id: 'edition.project-rule.v1',
      sourceKind: 'project-rule',
      title: 'Cinnabar evidence fixture rule',
      author: 'Cinnabar contributors',
      publicationDate: '2026-07-26',
      editionStatement: 'Version 1 test fixture',
      language: 'en',
      locatorScheme: 'canonical-paragraph',
      availability: 'open-licensed',
      license: { name: 'MIT', spdxId: 'MIT' },
      rightsNote: 'Synthetic project text created for contract testing.',
    },
  ],
  citations: [
    {
      id: 'citation.rule-paragraph',
      sourceEditionId: 'edition.project-rule.v1',
      locator: { chapter: 'Evidence fixtures', paragraph: '1' },
      passage: 'A displayed claim identifies the system fact or cited rule that supports it.',
      passageLanguage: 'en',
    },
  ],
  systemFacts: [
    {
      id: 'fact.fixture-output',
      factType: 'fixture-observation',
      label: 'Fixture output',
      value: '甲子',
      derivation: 'Literal deterministic fixture input; no calculation or interpretation.',
      producer: 'local-deterministic-engine',
      inputReliability: 'verified',
      epistemicStatus: 'verified',
      accessTier: 'free-basic-fact',
    },
  ],
  ruleEvidence: [
    {
      id: 'rule-evidence.traceability',
      ruleId: 'rule.claim-traceability',
      statement: 'Claims expose their supporting system facts or rule evidence.',
      citationIds: ['citation.rule-paragraph'],
      applicationNote: 'Applied only to this synthetic contract example.',
    },
  ],
  claims: [
    {
      id: 'claim.fixture-traceable',
      basis: 'fact-and-rule',
      statement: 'The fixture records 甲子 and exposes the rule used to describe it.',
      systemFactIds: ['fact.fixture-output'],
      ruleEvidenceIds: ['rule-evidence.traceability'],
      citationIds: ['citation.rule-paragraph'],
      uncertaintyIds: [],
      accessTier: 'free-basic-fact',
    },
  ],
  uncertainties: [],
  conflicts: [],
  synthesis: {
    status: 'independent-agreement',
    claimIds: ['claim.fixture-traceable'],
    rationale: 'Two independently identified evidence groups support the same limited claim.',
    independentEvidenceGroups: [
      ['fact.fixture-output'],
      ['rule-evidence.traceability'],
    ],
    sharedInputIds: [],
    conflictIds: [],
    missingEvidence: [],
  },
}

export function makeEvidenceFixture(status: SynthesisStatus = 'independent-agreement'): EvidenceBundle {
  const fixture = structuredClone(base)
  fixture.id = `fixture.${status}`
  fixture.synthesis.status = status

  if (status === 'shared-input-agreement') {
    fixture.synthesis.rationale = 'The apparent agreement shares the same underlying rule evidence.'
    fixture.synthesis.independentEvidenceGroups = []
    fixture.synthesis.sharedInputIds = ['rule-evidence.traceability']
  }
  if (status === 'conflict') {
    fixture.claims.push({
      id: 'claim.fixture-alternative',
      basis: 'rule-evidence',
      statement: 'A second scoped claim differs from the first.',
      ruleEvidenceIds: ['rule-evidence.traceability'],
      citationIds: ['citation.rule-paragraph'],
      uncertaintyIds: [],
      accessTier: 'paid-deep-compatibility',
    })
    fixture.conflicts.push({
      id: 'conflict.fixture',
      statement: 'The two scoped fixture claims cannot yet be reconciled.',
      positions: [
        { label: 'Primary', claimIds: ['claim.fixture-traceable'], evidenceIds: ['fact.fixture-output'] },
        { label: 'Alternative', claimIds: ['claim.fixture-alternative'], evidenceIds: ['rule-evidence.traceability'] },
      ],
      disposition: 'requires-review',
    })
    fixture.synthesis.rationale = 'The evidence supports incompatible scoped claims; no vote resolves them.'
    fixture.synthesis.independentEvidenceGroups = []
    fixture.synthesis.conflictIds = ['conflict.fixture']
  }
  if (status === 'insufficient-evidence') {
    fixture.synthesis.rationale = 'The available citation does not establish an independent second basis.'
    fixture.synthesis.independentEvidenceGroups = []
    fixture.synthesis.missingEvidence = ['A separately sourced passage with verified edition metadata.']
  }
  return fixture
}
