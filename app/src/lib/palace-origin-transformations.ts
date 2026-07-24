/**
 * Structural adapter for a palace's stem-origin Four Transformations.
 *
 * iztro owns the flying-transformation calculation through mutagedPlaces().
 * This module only normalizes its four ordered destination palaces for the UI.
 */

import {
  NATAL_TRANSFORMATION_ORDER,
  type NatalTransformationCode,
} from './chart-transformations'

export interface PalaceTransformationDestinationInput {
  name?: string
  earthlyBranch?: string
}

export interface PalaceTransformationSourceInput
  extends PalaceTransformationDestinationInput {
  heavenlyStem?: string
  mutagedPlaces?: () => Array<
    PalaceTransformationDestinationInput | null | undefined
  >
}

export interface PalaceOriginTransformation {
  code: NatalTransformationCode
  sourcePalaceName: string
  sourcePalaceStem: string
  targetPalaceName: string | null
  targetPalaceBranch: string | null
  isSamePalace: boolean
}

export function buildPalaceOriginTransformations(
  source: PalaceTransformationSourceInput,
  destinations: Array<
    PalaceTransformationDestinationInput | null | undefined
  >,
): PalaceOriginTransformation[] {
  const sourcePalaceName = source.name ?? ''
  const sourcePalaceStem = source.heavenlyStem ?? ''
  const sourcePalaceBranch = source.earthlyBranch ?? ''

  if (!sourcePalaceName || !sourcePalaceStem) return []

  return NATAL_TRANSFORMATION_ORDER.map((code, index) => {
    const target = destinations[index]
    const targetPalaceName = target?.name ?? null
    const targetPalaceBranch = target?.earthlyBranch ?? null

    return {
      code,
      sourcePalaceName,
      sourcePalaceStem,
      targetPalaceName,
      targetPalaceBranch,
      isSamePalace: !!targetPalaceName && (
        targetPalaceBranch
          ? targetPalaceBranch === sourcePalaceBranch
          : targetPalaceName === sourcePalaceName
      ),
    }
  })
}

export function collectPalaceOriginTransformations(
  source: PalaceTransformationSourceInput | null | undefined,
): PalaceOriginTransformation[] {
  if (!source || typeof source.mutagedPlaces !== 'function') return []

  try {
    return buildPalaceOriginTransformations(source, source.mutagedPlaces())
  } catch {
    return []
  }
}
