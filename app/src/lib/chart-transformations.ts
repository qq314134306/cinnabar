/**
 * Provider-independent extraction of the natal Four Transformations.
 *
 * iztro keeps the natal transformation code on the star itself. This helper
 * only indexes that engine output; it does not add interpretation or scores.
 */

export const NATAL_TRANSFORMATION_ORDER = ['禄', '权', '科', '忌'] as const

export type NatalTransformationCode =
  (typeof NATAL_TRANSFORMATION_ORDER)[number]

interface TransformationStarInput {
  name: string
  mutagen?: unknown
  brightness?: string
}

export interface NatalTransformationPalaceInput {
  name: string
  earthlyBranch?: string
  majorStars?: TransformationStarInput[]
  minorStars?: TransformationStarInput[]
}

export interface NatalTransformation {
  code: NatalTransformationCode
  starName: string
  starKind: 'major' | 'minor'
  brightness?: string
  palaceName: string
  palaceBranch: string
}

function transformationCodes(value: unknown): NatalTransformationCode[] {
  const values = Array.isArray(value) ? value : [value]
  return NATAL_TRANSFORMATION_ORDER.filter((code) => values.includes(code))
}

export function collectNatalTransformations(
  palaces: NatalTransformationPalaceInput[],
): NatalTransformation[] {
  const found = new Map<NatalTransformationCode, NatalTransformation>()

  for (const palace of palaces) {
    const starGroups = [
      { stars: palace.majorStars ?? [], kind: 'major' as const },
      { stars: palace.minorStars ?? [], kind: 'minor' as const },
    ]

    for (const { stars, kind } of starGroups) {
      for (const star of stars) {
        for (const code of transformationCodes(star.mutagen)) {
          if (found.has(code)) continue
          found.set(code, {
            code,
            starName: star.name,
            starKind: kind,
            brightness: star.brightness,
            palaceName: palace.name,
            palaceBranch: palace.earthlyBranch ?? '',
          })
        }
      }
    }
  }

  return NATAL_TRANSFORMATION_ORDER.flatMap((code) => {
    const transformation = found.get(code)
    return transformation ? [transformation] : []
  })
}
