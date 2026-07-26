// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BaziCompatibilityResult } from '@/lib/bazi-compatibility'
import { BaZiCompatibility } from './BaZiCompatibility'

const RESULT: BaziCompatibilityResult = {
  personA: {
    dayMaster: { stem: '丙', element: 'Fire', polarity: 'Yang' },
    dayPillar: { stem: '丙', branch: '寅', ganZhi: '丙寅' },
    pillars: [
      { scope: 'year', stem: '庚', branch: '午', ganZhi: '庚午' },
      { scope: 'month', stem: '戊', branch: '寅', ganZhi: '戊寅' },
      { scope: 'day', stem: '丙', branch: '寅', ganZhi: '丙寅' },
      { scope: 'hour', stem: '甲', branch: '午', ganZhi: '甲午' },
    ],
  },
  personB: {
    dayMaster: { stem: '辛', element: 'Metal', polarity: 'Yin' },
    dayPillar: { stem: '辛', branch: '亥', ganZhi: '辛亥' },
    pillars: [
      { scope: 'year', stem: '壬', branch: '申', ganZhi: '壬申' },
      { scope: 'month', stem: '乙', branch: '巳', ganZhi: '乙巳' },
      { scope: 'day', stem: '辛', branch: '亥', ganZhi: '辛亥' },
      { scope: 'hour', stem: '乙', branch: '未', ganZhi: '乙未' },
    ],
  },
  personAToB: {
    relationship: 'directWealth',
    label: 'Direct Wealth',
    description: 'From this Day Master, the other Day Master is controlled with opposite polarity.',
  },
  personBToA: {
    relationship: 'directOfficer',
    label: 'Direct Officer',
    description: 'From this Day Master, the other Day Master controls the source with opposite polarity.',
  },
  dayBranchRelation: {
    kind: 'sixHarmony',
    label: 'Six Harmony · Liu He',
    description: 'A named structural contact.',
  },
  branchContacts: [
    {
      personAScope: 'year',
      personABranch: '午',
      personBScope: 'hour',
      personBBranch: '未',
      kind: 'sixHarmony',
      label: 'Six Harmony · Liu He',
    },
    {
      personAScope: 'month',
      personABranch: '寅',
      personBScope: 'year',
      personBBranch: '申',
      kind: 'sixClash',
      label: 'Six Clash · Liu Chong',
    },
  ],
  stemRelationships: {
    personAToB: [
      { targetScope: 'year', targetStem: '壬', relationship: 'sevenKillings', label: 'Seven Killings' },
      { targetScope: 'month', targetStem: '乙', relationship: 'directResource', label: 'Direct Resource' },
      { targetScope: 'day', targetStem: '辛', relationship: 'directWealth', label: 'Direct Wealth' },
      { targetScope: 'hour', targetStem: '乙', relationship: 'directResource', label: 'Direct Resource' },
    ],
    personBToA: [
      { targetScope: 'year', targetStem: '庚', relationship: 'robWealth', label: 'Rob Wealth' },
      { targetScope: 'month', targetStem: '戊', relationship: 'directResource', label: 'Direct Resource' },
      { targetScope: 'day', targetStem: '丙', relationship: 'directOfficer', label: 'Direct Officer' },
      { targetScope: 'hour', targetStem: '甲', relationship: 'directWealth', label: 'Direct Wealth' },
    ],
  },
  provisional: false,
}

afterEach(cleanup)

describe('BaZiCompatibility', () => {
  it('renders both directional relationships without merging them into a score', () => {
    const { container } = render(createElement(BaZiCompatibility, { result: RESULT }))

    expect(screen.getByRole('heading', {
      name: 'BaZi compatibility · Four Pillars',
    })).toBeTruthy()
    expect(screen.getAllByText('Direct Wealth')).toHaveLength(3)
    expect(screen.getAllByText('Direct Officer')).toHaveLength(2)
    expect(screen.getAllByText('Six Harmony · Liu He')).toHaveLength(2)
    expect(container.querySelectorAll('[data-bazi-compatibility-person]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-bazi-pillar]')).toHaveLength(8)
    expect(screen.getByRole('heading', {
      name: 'Visible-stem Ten Gods map',
    })).toBeTruthy()
    expect(container.querySelectorAll('[data-bazi-stem-direction]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-bazi-stem-relationship]')).toHaveLength(8)
    expect(screen.getByText('B Year · Ren')).toBeTruthy()
    expect(screen.getByText('A Year · Geng')).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Four-Pillar branch contacts',
    })).toBeTruthy()
    expect(container.querySelectorAll('[data-bazi-branch-contact]')).toHaveLength(2)
    expect(screen.getByText('A Year · Wu ↔ B Hour · Wei')).toBeTruthy()
    expect(screen.getAllByText('Year')).toHaveLength(2)
    expect(screen.getAllByText('Hour')).toHaveLength(2)
    expect(screen.getByText(/no score, fate claim/)).toBeTruthy()
  })

  it('marks approximate inputs provisional', () => {
    render(createElement(BaZiCompatibility, {
      result: { ...RESULT, provisional: true },
    }))

    expect(screen.getByRole('note').textContent).toContain(
      'treat this Four Pillar comparison as provisional',
    )
  })

  it('shows an explicit empty state when no canonical contact is recognized', () => {
    render(createElement(BaZiCompatibility, {
      result: { ...RESULT, branchContacts: [] },
    }))

    expect(screen.getByText(
      'No same-branch, Liu He, or Liu Chong contact appears across the 16 pairings.',
    )).toBeTruthy()
  })
})
