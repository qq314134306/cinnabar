// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ZiweiCompatibilityResult } from '@/lib/ziwei-compatibility'
import { ZiweiCompatibility } from './ZiweiCompatibility'

afterEach(cleanup)

const BASE: ZiweiCompatibilityResult = {
  charts: [
    { label: 'Person A', solarDate: '1990-1-1', reliableTime: true, lifePalaceBranch: '未', lifePalaceStars: ['天梁'] },
    { label: 'Person B', solarDate: '1992-6-15', reliableTime: true, lifePalaceBranch: '亥', lifePalaceStars: ['天同'] },
  ],
  uncertainty: { suppressed: false },
  palaceOverlays: [
    { direction: 'A→B', sourcePalace: '命宫', branch: '未', receivingPalace: '财帛' },
  ],
  crossTransformations: [
    { direction: 'A→B', code: '科', starName: '天梁', sourcePalace: '命宫', branch: '未', receivingPalace: '财帛' },
  ],
  sanFangInteractions: [
    {
      direction: 'A→B', focusPalace: '命宫', focusBranch: '未',
      receivingPalaces: [
        { role: 'focus', branch: '未', palaceName: '财帛' },
        { role: 'opposite', branch: '丑', palaceName: '福德' },
      ],
    },
  ],
}

describe('ZiweiCompatibility', () => {
  it('renders evidence chains without a verdict or BaZi facts', () => {
    render(createElement(ZiweiCompatibility, { result: BASE }))

    expect(screen.getByText(/Life at 未 overlays Wealth/)).toBeTruthy()
    expect(screen.getByText(/天梁 transforms as Ke/)).toBeTruthy()
    expect(screen.getByText(/opposite: Inner Life/)).toBeTruthy()
    expect(screen.getByText(/does not supply BaZi pillars/)).toBeTruthy()
    expect(screen.queryByText(/compatible|incompatible/i)).toBeNull()
  })

  it('shows the fail-closed uncertainty reason and no affected evidence', () => {
    render(createElement(ZiweiCompatibility, {
      result: {
        ...BASE,
        charts: [
          { label: 'Person A', solarDate: '1990-1-1', reliableTime: false, lifePalaceStars: [] },
          BASE.charts[1],
        ],
        uncertainty: { suppressed: true, reason: 'Approximate time: affected conclusions withheld.' },
        palaceOverlays: [],
        crossTransformations: [],
        sanFangInteractions: [],
      },
    }))

    expect(screen.getByText('Hour-dependent palace details withheld.')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('affected conclusions withheld')
    expect(screen.queryByText('Key palace overlays')).toBeNull()
  })
})
