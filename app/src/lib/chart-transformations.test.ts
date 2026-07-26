import { describe, expect, it } from 'vitest'
import {
  collectNatalTransformations,
  NATAL_TRANSFORMATION_ORDER,
} from './chart-transformations'

describe('natal Four Transformations index', () => {
  it('collects major and minor star transformations in canonical order', () => {
    const transformations = collectNatalTransformations([
      {
        name: '命宫',
        earthlyBranch: '巳',
        majorStars: [
          { name: '天梁', mutagen: '科', brightness: '旺' },
          { name: '天机', mutagen: '忌' },
        ],
        minorStars: [],
      },
      {
        name: '官禄',
        earthlyBranch: '酉',
        majorStars: [{ name: '紫微', mutagen: '权' }],
        minorStars: [{ name: '文昌', mutagen: ['禄'] }],
      },
    ])

    expect(transformations.map((item) => item.code)).toEqual(
      NATAL_TRANSFORMATION_ORDER,
    )
    expect(transformations[0]).toMatchObject({
      code: '禄',
      starName: '文昌',
      starKind: 'minor',
      palaceName: '官禄',
      palaceBranch: '酉',
    })
    expect(transformations[2]).toMatchObject({
      code: '科',
      starName: '天梁',
      brightness: '旺',
      starKind: 'major',
    })
  })

  it('keeps the first engine owner when malformed input repeats a code', () => {
    expect(collectNatalTransformations([
      {
        name: '命宫',
        majorStars: [{ name: '天梁', mutagen: '科' }],
      },
      {
        name: '官禄',
        majorStars: [{ name: '紫微', mutagen: '科' }],
      },
    ])).toEqual([
      expect.objectContaining({
        code: '科',
        starName: '天梁',
        palaceName: '命宫',
      }),
    ])
  })

  it('ignores unknown transformation and empty star values', () => {
    expect(collectNatalTransformations([
      {
        name: '命宫',
        majorStars: [
          { name: '天梁', mutagen: 'unknown' },
          { name: '天机' },
        ],
      },
    ])).toEqual([])
  })
})
