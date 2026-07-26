// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeEvidenceFixture } from '@/lib/evidence-fixtures'
import { EvidencePanel } from './EvidencePanel'

afterEach(cleanup)

describe('EvidencePanel', () => {
  it('renders claims, their basis, passage location, edition, and rights metadata', () => {
    render(createElement(EvidencePanel, { bundle: makeEvidenceFixture() }))
    expect(screen.getByRole('heading', { name: 'Passage evidence contract example' })).toBeTruthy()
    expect(screen.getByText(/Basis: fact\.fixture-output, rule-evidence\.traceability/)).toBeTruthy()
    expect(screen.getByText(/Version 1 test fixture · chapter Evidence fixtures · paragraph 1/)).toBeTruthy()
    expect(screen.getByText(/Availability: open-licensed · License\/rights: MIT/)).toBeTruthy()
    expect(screen.getByText(/For entertainment & self-discovery/)).toBeTruthy()
    expect(screen.getByText(/Candidate birth times never replace the canonical birth time/)).toBeTruthy()
    expect(screen.getByText('Access: free-basic-fact')).toBeTruthy()
  })

  it.each([
    ['shared-input-agreement', 'Shared-input agreement'],
    ['conflict', 'Conflict'],
    ['insufficient-evidence', 'Insufficient evidence'],
  ] as const)('discloses %s without a confidence score', (status, label) => {
    const view = render(createElement(EvidencePanel, { bundle: makeEvidenceFixture(status) }))
    expect(screen.getByText(`Synthesis: ${label}`)).toBeTruthy()
    expect(view.container.textContent).not.toMatch(/\d+%|confidence/i)
  })

  it('fails closed instead of rendering an invalid evidence bundle', () => {
    const bundle = makeEvidenceFixture()
    bundle.citations[0].sourceEditionId = 'unknown'
    expect(() => render(createElement(EvidencePanel, { bundle }))).toThrow(/unknown id/)
  })
})
