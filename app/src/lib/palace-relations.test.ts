import { describe, expect, it } from 'vitest'
import {
  EARTHLY_BRANCHES,
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
