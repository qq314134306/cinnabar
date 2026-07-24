import { describe, expect, it } from 'vitest'
import {
  EARTHLY_BRANCHES,
  getFlankingPalaces,
  getSanFangSiZheng,
} from './palace-relations'

describe('San Fang Si Zheng palace relations', () => {
  it('returns the focus, two trines, and opposite for a known branch', () => {
    expect(getSanFangSiZheng('子')).toEqual([
      { branch: '子', role: 'focus' },
      { branch: '辰', role: 'trine' },
      { branch: '午', role: 'opposite' },
      { branch: '申', role: 'trine' },
    ])
  })

  it('returns four unique palaces for every earthly branch', () => {
    for (const branch of EARTHLY_BRANCHES) {
      const relations = getSanFangSiZheng(branch)
      expect(relations).toHaveLength(4)
      expect(new Set(relations.map((relation) => relation.branch)).size).toBe(4)
      expect(relations.filter((relation) => relation.role === 'focus')).toHaveLength(1)
      expect(relations.filter((relation) => relation.role === 'trine')).toHaveLength(2)
      expect(relations.filter((relation) => relation.role === 'opposite')).toHaveLength(1)
    }
  })

  it('keeps opposite and trine relationships reciprocal', () => {
    for (const branch of EARTHLY_BRANCHES) {
      const relations = getSanFangSiZheng(branch)
      const opposite = relations.find((relation) => (
        relation.role === 'opposite'
      ))
      expect(
        getSanFangSiZheng(opposite?.branch ?? '').find((relation) => (
          relation.role === 'opposite'
        ))?.branch,
      ).toBe(branch)

      for (const trine of relations.filter((relation) => (
        relation.role === 'trine'
      ))) {
        expect(
          getSanFangSiZheng(trine.branch).some((relation) => (
            relation.role === 'trine' && relation.branch === branch
          )),
        ).toBe(true)
      }
    }
  })

  it('returns no invented relation for an unknown engine value', () => {
    expect(getSanFangSiZheng('unknown')).toEqual([])
  })
})

describe('flanking palace relations', () => {
  it('returns the immediate neighbors with wraparound', () => {
    expect(getFlankingPalaces('子')).toEqual([
      { branch: '亥', side: 'previous' },
      { branch: '丑', side: 'next' },
    ])
  })

  it('returns two unique non-focus neighbors for every earthly branch', () => {
    for (const branch of EARTHLY_BRANCHES) {
      const flanks = getFlankingPalaces(branch)
      expect(flanks).toHaveLength(2)
      expect(new Set(flanks.map((flank) => flank.branch)).size).toBe(2)
      expect(flanks.some((flank) => flank.branch === branch)).toBe(false)
    }
  })

  it('keeps the previous and next relationships reciprocal', () => {
    for (const branch of EARTHLY_BRANCHES) {
      const flanks = getFlankingPalaces(branch)
      const previous = flanks.find((flank) => flank.side === 'previous')
      const next = flanks.find((flank) => flank.side === 'next')

      expect(
        getFlankingPalaces(previous?.branch ?? '').find((flank) => (
          flank.side === 'next'
        ))?.branch,
      ).toBe(branch)
      expect(
        getFlankingPalaces(next?.branch ?? '').find((flank) => (
          flank.side === 'previous'
        ))?.branch,
      ).toBe(branch)
    }
  })

  it('returns no invented flanks for an unknown engine value', () => {
    expect(getFlankingPalaces('unknown')).toEqual([])
  })
})
