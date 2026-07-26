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
      { scope: 'year', stem: '庚', branch: '午', ganZhi: '庚午', hiddenStems: ['丁', '己'] },
      { scope: 'month', stem: '戊', branch: '寅', ganZhi: '戊寅', hiddenStems: ['甲', '丙', '戊'] },
      { scope: 'day', stem: '丙', branch: '寅', ganZhi: '丙寅', hiddenStems: ['甲', '丙', '戊'] },
      { scope: 'hour', stem: '甲', branch: '午', ganZhi: '甲午', hiddenStems: ['丁', '己'] },
    ],
  },
  personB: {
    dayMaster: { stem: '辛', element: 'Metal', polarity: 'Yin' },
    dayPillar: { stem: '辛', branch: '亥', ganZhi: '辛亥' },
    pillars: [
      { scope: 'year', stem: '壬', branch: '申', ganZhi: '壬申', hiddenStems: ['庚', '壬', '戊'] },
      { scope: 'month', stem: '乙', branch: '巳', ganZhi: '乙巳', hiddenStems: ['丙', '庚', '戊'] },
      { scope: 'day', stem: '辛', branch: '亥', ganZhi: '辛亥', hiddenStems: ['壬', '甲'] },
      { scope: 'hour', stem: '乙', branch: '未', ganZhi: '乙未', hiddenStems: ['己', '丁', '乙'] },
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
  stemContacts: [
    {
      personAScope: 'year',
      personAStem: '庚',
      personBScope: 'month',
      personBStem: '乙',
      kind: 'fiveCombination',
      label: 'Five Combination · Wu He',
    },
    {
      personAScope: 'year',
      personAStem: '庚',
      personBScope: 'hour',
      personBStem: '乙',
      kind: 'fiveCombination',
      label: 'Five Combination · Wu He',
    },
    {
      personAScope: 'day',
      personAStem: '丙',
      personBScope: 'day',
      personBStem: '辛',
      kind: 'fiveCombination',
      label: 'Five Combination · Wu He',
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
  hiddenStemRelationships: {
    personAToB: [
      { targetScope: 'year', targetBranch: '申', targetStem: '庚', hiddenStemIndex: 0, relationship: 'indirectWealth', label: 'Indirect Wealth' },
      { targetScope: 'year', targetBranch: '申', targetStem: '壬', hiddenStemIndex: 1, relationship: 'sevenKillings', label: 'Seven Killings' },
      { targetScope: 'year', targetBranch: '申', targetStem: '戊', hiddenStemIndex: 2, relationship: 'eatingGod', label: 'Eating God' },
      { targetScope: 'month', targetBranch: '巳', targetStem: '丙', hiddenStemIndex: 0, relationship: 'peer', label: 'Peer' },
      { targetScope: 'month', targetBranch: '巳', targetStem: '庚', hiddenStemIndex: 1, relationship: 'indirectWealth', label: 'Indirect Wealth' },
      { targetScope: 'month', targetBranch: '巳', targetStem: '戊', hiddenStemIndex: 2, relationship: 'eatingGod', label: 'Eating God' },
      { targetScope: 'day', targetBranch: '亥', targetStem: '壬', hiddenStemIndex: 0, relationship: 'sevenKillings', label: 'Seven Killings' },
      { targetScope: 'day', targetBranch: '亥', targetStem: '甲', hiddenStemIndex: 1, relationship: 'indirectResource', label: 'Indirect Resource' },
      { targetScope: 'hour', targetBranch: '未', targetStem: '己', hiddenStemIndex: 0, relationship: 'hurtingOfficer', label: 'Hurting Officer' },
      { targetScope: 'hour', targetBranch: '未', targetStem: '丁', hiddenStemIndex: 1, relationship: 'robWealth', label: 'Rob Wealth' },
      { targetScope: 'hour', targetBranch: '未', targetStem: '乙', hiddenStemIndex: 2, relationship: 'directResource', label: 'Direct Resource' },
    ],
    personBToA: [
      { targetScope: 'year', targetBranch: '午', targetStem: '丁', hiddenStemIndex: 0, relationship: 'sevenKillings', label: 'Seven Killings' },
      { targetScope: 'year', targetBranch: '午', targetStem: '己', hiddenStemIndex: 1, relationship: 'indirectResource', label: 'Indirect Resource' },
      { targetScope: 'month', targetBranch: '寅', targetStem: '甲', hiddenStemIndex: 0, relationship: 'directWealth', label: 'Direct Wealth' },
      { targetScope: 'month', targetBranch: '寅', targetStem: '丙', hiddenStemIndex: 1, relationship: 'directOfficer', label: 'Direct Officer' },
      { targetScope: 'month', targetBranch: '寅', targetStem: '戊', hiddenStemIndex: 2, relationship: 'directResource', label: 'Direct Resource' },
      { targetScope: 'day', targetBranch: '寅', targetStem: '甲', hiddenStemIndex: 0, relationship: 'directWealth', label: 'Direct Wealth' },
      { targetScope: 'day', targetBranch: '寅', targetStem: '丙', hiddenStemIndex: 1, relationship: 'directOfficer', label: 'Direct Officer' },
      { targetScope: 'day', targetBranch: '寅', targetStem: '戊', hiddenStemIndex: 2, relationship: 'directResource', label: 'Direct Resource' },
      { targetScope: 'hour', targetBranch: '午', targetStem: '丁', hiddenStemIndex: 0, relationship: 'sevenKillings', label: 'Seven Killings' },
      { targetScope: 'hour', targetBranch: '午', targetStem: '己', hiddenStemIndex: 1, relationship: 'indirectResource', label: 'Indirect Resource' },
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
      name: 'Hidden-stem Ten Gods map',
    })).toBeTruthy()
    expect(container.querySelectorAll('[data-bazi-hidden-stem-direction]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-bazi-hidden-stem-relationship]')).toHaveLength(21)
    expect(screen.getByText('B Year · Shen')).toBeTruthy()
    expect(screen.getByText('A Year · Wu')).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Heavenly Stem Five Combinations',
    })).toBeTruthy()
    expect(container.querySelectorAll('[data-bazi-stem-contact]')).toHaveLength(3)
    expect(screen.getByText('A Day · Bing ↔ B Day · Xin')).toBeTruthy()
    expect(screen.getAllByText('Five Combination · Wu He')).toHaveLength(3)
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

  it('shows an explicit empty state when no Five Combination is recognized', () => {
    render(createElement(BaZiCompatibility, {
      result: { ...RESULT, stemContacts: [] },
    }))

    expect(screen.getByText(
      'No Five Combination appears across the 16 visible-stem pairings.',
    )).toBeTruthy()
  })
})
