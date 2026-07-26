import { describe, expect, it } from 'vitest'
import { BAZI_ELEMENT_ORDER, buildBaziElementStructure } from './bazi-element-structure'

describe('buildBaziElementStructure', () => {
  it('lists each visible stem and branch in pillar order and counts all five elements', () => {
    const result = buildBaziElementStructure([
      { scope: 'year', stem: '甲', branch: '子' },
      { scope: 'month', stem: '丙', branch: '丑' },
      { scope: 'day', stem: '庚', branch: '寅' },
      { scope: 'hour', stem: '癸', branch: '巳' },
    ])

    expect(result?.entries).toEqual([
      { scope: 'year', source: 'stem', character: '甲', element: 'Wood' },
      { scope: 'year', source: 'branch', character: '子', element: 'Water' },
      { scope: 'month', source: 'stem', character: '丙', element: 'Fire' },
      { scope: 'month', source: 'branch', character: '丑', element: 'Earth' },
      { scope: 'day', source: 'stem', character: '庚', element: 'Metal' },
      { scope: 'day', source: 'branch', character: '寅', element: 'Wood' },
      { scope: 'hour', source: 'stem', character: '癸', element: 'Water' },
      { scope: 'hour', source: 'branch', character: '巳', element: 'Fire' },
    ])
    expect(result?.counts).toEqual({
      Wood: 2,
      Fire: 2,
      Earth: 1,
      Metal: 1,
      Water: 2,
    })
    expect(BAZI_ELEMENT_ORDER).toEqual(['Wood', 'Fire', 'Earth', 'Metal', 'Water'])
  })

  it('fails closed when a stem or branch is outside the canonical maps', () => {
    expect(buildBaziElementStructure([
      { scope: 'year', stem: '?', branch: '子' },
    ])).toBeNull()
    expect(buildBaziElementStructure([
      { scope: 'year', stem: '甲', branch: '?' },
    ])).toBeNull()
  })
})
