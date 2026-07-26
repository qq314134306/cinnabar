/**
 * Structural adapter for a palace's stem-origin Four Transformations.
 *
 * iztro owns the flying-transformation calculation through mutagedPlaces()
 * and the active stem-to-star mapping through getMutagensByHeavenlyStem().
 * This module only joins those engine results in canonical order for the UI.
 */

import { util } from 'iztro'
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
  starName: string | null
  targetPalaceName: string | null
  targetPalaceBranch: string | null
  isSamePalace: boolean
}

export function buildPalaceOriginTransformations(
  source: PalaceTransformationSourceInput,
  destinations: Array<
    PalaceTransformationDestinationInput | null | undefined
  >,
  starNames: Array<string | null | undefined>,
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
      starName: starNames[index] ?? null,
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
  const sourceStem = source.heavenlyStem
  if (!sourceStem) return []

  try {
    const starNames = util.getMutagensByHeavenlyStem(
      sourceStem as Parameters<typeof util.getMutagensByHeavenlyStem>[0],
    )
    return buildPalaceOriginTransformations(
      source,
      source.mutagedPlaces(),
      starNames,
    )
  } catch {
    return []
  }
}
