import { describe, expect, it } from 'vitest'
import { assertEvidenceBundle, type EvidenceBundle, type SynthesisStatus } from './evidence-contract'
import { makeEvidenceFixture } from './evidence-fixtures'

function mutate(change: (bundle: EvidenceBundle) => void): EvidenceBundle {
  const bundle = makeEvidenceFixture()
  change(bundle)
  return bundle
}

describe('evidence contract', () => {
  it.each<SynthesisStatus>([
    'independent-agreement',
    'shared-input-agreement',
    'conflict',
    'insufficient-evidence',
  ])('accepts the exhaustive score-free synthesis state %s', (status) => {
    expect(() => assertEvidenceBundle(makeEvidenceFixture(status))).not.toThrow()
  })

  it('rejects a citation without page, chapter, paragraph, folio, or anchor location', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.citations[0].locator = {} })))
      .toThrow(/passage locator/)
  })

  it('rejects an unknown source edition', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.citations[0].sourceEditionId = 'missing' })))
      .toThrow(/unknown id missing/)
  })

  it('requires explicit edition, license, and rights metadata', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.sourceEditions[0].rightsNote = '' })))
      .toThrow(/rightsNote/)
  })

  it('requires every rule evidence record to cite a passage', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.ruleEvidence[0].citationIds = [] })))
      .toThrow(/at least one citation/)
  })

  it('rejects a claim with neither a system fact nor rule evidence', () => {
    const bundle = mutate((value) => {
      value.claims[0] = { ...value.claims[0], systemFactIds: [], ruleEvidenceIds: [] } as never
    })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/requires a system fact or rule evidence/)
  })

  it('rejects dangling fact, rule, citation, and uncertainty references', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.claims[0].systemFactIds = ['missing'] })))
      .toThrow(/unknown id missing/)
  })

  it('requires independent agreement to identify two independent evidence groups', () => {
    expect(() => assertEvidenceBundle(mutate((bundle) => { bundle.synthesis.independentEvidenceGroups = [[]] })))
      .toThrow(/two independent groups/)
  })

  it('does not allow shared-input agreement to hide its common input', () => {
    const bundle = makeEvidenceFixture('shared-input-agreement')
    bundle.synthesis.sharedInputIds = []
    expect(() => assertEvidenceBundle(bundle)).toThrow(/explicit shared inputs/)
  })

  it('requires conflict status to point to a structured conflict', () => {
    const bundle = makeEvidenceFixture('conflict')
    bundle.synthesis.conflictIds = []
    expect(() => assertEvidenceBundle(bundle)).toThrow(/explicit conflict record/)
  })

  it('requires insufficient evidence to name what is missing', () => {
    const bundle = makeEvidenceFixture('insufficient-evidence')
    bundle.synthesis.missingEvidence = []
    expect(() => assertEvidenceBundle(bundle)).toThrow(/what is missing/)
  })

  it('rejects duplicate identifiers so references stay unambiguous', () => {
    const bundle = mutate((value) => { value.citations.push(structuredClone(value.citations[0])) })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/duplicate id/)
  })

  it('contains no vote, score, probability, or numeric confidence field', () => {
    const serialized = JSON.stringify(makeEvidenceFixture())
    expect(serialized).not.toMatch(/"(?:vote|score|probability|confidence)"\s*:/i)
  })

  it.each(['vote', 'score', 'probability', 'confidence'])('rejects an injected %s field', (field) => {
    const bundle = makeEvidenceFixture()
    Object.assign(bundle.synthesis, { [field]: field === 'vote' ? '2-1' : 0.9 })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/unsupported synthesis field/)
  })

  it('rejects evidence groups that claim independence while sharing an input', () => {
    const bundle = makeEvidenceFixture()
    bundle.synthesis.independentEvidenceGroups = [
      ['fact.fixture-output'],
      ['fact.fixture-output', 'rule-evidence.traceability'],
    ]
    expect(() => assertEvidenceBundle(bundle)).toThrow(/share input/)
  })

  it('pins the English entertainment and server-only verified-fact policy', () => {
    const policy = makeEvidenceFixture().productPolicy
    expect(policy).toEqual({
      audienceLocale: 'en',
      useContext: 'entertainment-and-self-discovery',
      factAuthority: 'local-deterministic-engine',
      skillRole: 'rule-constraints-and-anonymous-dev-validation',
      externalValidation: 'anonymous-fixed-fixtures-only-fail-closed',
      narrativeBoundary: 'server-only-rendering-no-fact-mutation',
      candidateBirthTimePolicy: 'never-overwrite-canonical',
      profilePersistence: 'explicit-user-save-only',
    })
  })

  it('never admits an hour-pillar fact from unreliable birth time', () => {
    const bundle = mutate((value) => {
      value.systemFacts[0].factType = 'hour-pillar'
      value.systemFacts[0].inputReliability = 'approximate'
      value.systemFacts[0].epistemicStatus = 'provisional'
    })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/requires verified birth time/)
  })

  it('keeps a birth-time finder result candidate-only', () => {
    const bundle = mutate((value) => {
      value.systemFacts[0].factType = 'birth-time-candidate'
      value.systemFacts[0].epistemicStatus = 'verified'
    })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/must remain candidate-only/)
  })

  it.each(['fortune telling', 'psychic', 'consulting'])('rejects %s product positioning', (term) => {
    const bundle = mutate((value) => { value.claims[0].statement = `A ${term} claim.` })
    expect(() => assertEvidenceBundle(bundle)).toThrow(/disallowed product positioning/)
  })

  it('keeps free facts and paid deep interpretation as separate extensible tiers', () => {
    expect(makeEvidenceFixture('conflict').claims.map((claim) => claim.accessTier))
      .toEqual(['free-basic-fact', 'paid-deep-compatibility'])
  })
})
