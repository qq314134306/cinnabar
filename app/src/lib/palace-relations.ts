/**
 * Pure earthly-branch relationships used by the natal chart presentation.
 *
 * San Fang Si Zheng combines the focus palace, its two trine palaces, and its
 * opposite palace. The engine remains zh-CN internally, so these keys use the
 * twelve earthly branches exactly as iztro returns them.
 */

export const EARTHLY_BRANCHES = [
  '子', '丑', '寅', '卯', '辰', '巳',
  '午', '未', '申', '酉', '戌', '亥',
] as const

export type PalaceRelationRole = 'focus' | 'trine' | 'opposite'

export interface PalaceRelation {
  branch: string
  role: PalaceRelationRole
}

export type FlankingPalaceSide = 'previous' | 'next'

export interface FlankingPalace {
  branch: string
  side: FlankingPalaceSide
}

export function getSanFangSiZheng(
  focusBranch: string,
): PalaceRelation[] {
  const focusIndex = EARTHLY_BRANCHES.indexOf(
    focusBranch as (typeof EARTHLY_BRANCHES)[number],
  )
  if (focusIndex < 0) return []

  const branchAt = (offset: number): string => (
    EARTHLY_BRANCHES[(focusIndex + offset) % EARTHLY_BRANCHES.length]
  )

  return [
    { branch: branchAt(0), role: 'focus' },
    { branch: branchAt(4), role: 'trine' },
    { branch: branchAt(6), role: 'opposite' },
    { branch: branchAt(8), role: 'trine' },
  ]
}

export function getFlankingPalaces(
  focusBranch: string,
): FlankingPalace[] {
  const focusIndex = EARTHLY_BRANCHES.indexOf(
    focusBranch as (typeof EARTHLY_BRANCHES)[number],
  )
  if (focusIndex < 0) return []

  const branchAt = (offset: number): string => (
    EARTHLY_BRANCHES[
      (focusIndex + offset + EARTHLY_BRANCHES.length)
      % EARTHLY_BRANCHES.length
    ]
  )

  return [
    { branch: branchAt(-1), side: 'previous' },
    { branch: branchAt(1), side: 'next' },
  ]
}
