import { describe, expect, it } from 'vitest'
import {
  getMajorStarExplanation,
  getPalaceExplanation,
  MAJOR_STAR_EXPLANATIONS,
  PALACE_EXPLANATIONS,
} from './chart-explanations'

const CANONICAL_PALACES = [
  '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
  '迁移', '仆役', '官禄', '田宅', '福德', '父母',
]

const MAJOR_STARS = [
  '紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府',
  '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军',
]

const CJK = /[\u3400-\u9fff]/
const DETERMINISTIC_CLAIMS =
  /\b(?:you will|will be|is destined|guarantees success|predicts your|determines your)\b/i

describe('local chart explanations', () => {
  it('covers every canonical palace and the friends-palace alias', () => {
    for (const name of CANONICAL_PALACES) {
      expect(getPalaceExplanation(name), name).toBeDefined()
    }
    expect(PALACE_EXPLANATIONS['交友']).toEqual(PALACE_EXPLANATIONS['仆役'])
  })

  it('covers all fourteen major stars', () => {
    expect(Object.keys(MAJOR_STAR_EXPLANATIONS)).toHaveLength(14)
    for (const name of MAJOR_STARS) {
      expect(getMajorStarExplanation(name), name).toBeDefined()
    }
  })

  it('keeps display copy English and avoids deterministic claims', () => {
    const explanations = [
      ...Object.values(PALACE_EXPLANATIONS),
      ...Object.values(MAJOR_STAR_EXPLANATIONS),
    ]

    for (const explanation of explanations) {
      const copy = `${explanation.summary} ${explanation.watchFor}`
      expect(copy).not.toMatch(CJK)
      expect(copy).not.toMatch(DETERMINISTIC_CLAIMS)
    }
  })

  it('returns no invented explanation for unknown engine values', () => {
    expect(getPalaceExplanation('unknown')).toBeUndefined()
    expect(getMajorStarExplanation('unknown')).toBeUndefined()
  })
})
