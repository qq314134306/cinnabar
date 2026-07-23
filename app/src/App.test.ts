// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  initAuth: vi.fn(),
  clearChart: vi.fn(),
  trackPageView: vi.fn(),
}))

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}))
vi.mock('@/lib/analytics', () => ({
  trackPageView: mocks.trackPageView,
}))
vi.mock('@/stores', () => {
  const useChartStore = Object.assign(
    () => ({ chart: {} }),
    { getState: () => ({ clear: mocks.clearChart }) },
  )
  return {
    useChartStore,
    useAuthStore: (selector: (state: { init: () => void }) => unknown) => (
      selector({ init: mocks.initAuth })
    ),
  }
})
vi.mock('@/components/BirthForm', () => ({
  BirthForm: () => createElement('div', null, 'Birth Form'),
}))
vi.mock('@/components/chart', () => ({
  ChartDisplay: () => createElement('div', null, 'Chart Display'),
}))
vi.mock('@/components/AIInterpretation', () => ({
  AIInterpretation: () => createElement('div', null, 'AI Interpretation'),
}))
vi.mock('@/components/match', () => ({
  MatchAnalysis: () => createElement('div', null, 'Match Analysis'),
}))
vi.mock('@/components/kline/LifeKLine', () => ({
  LifeKLine: () => createElement('div', null, 'Life Timeline Content'),
}))
vi.mock('@/components/share', () => ({
  ShareCard: () => createElement('div', null, 'Share Card Content'),
}))
vi.mock('@/components/OpenSourceLinks', () => ({
  GitHubLinkButton: () => null,
  OpenSourceFooterLinks: () => null,
}))
vi.mock('@/components/ExitIntentModal', () => ({
  ExitIntentModal: () => null,
}))
vi.mock('@/components/AuthControl', () => ({
  AuthControl: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App navigation', () => {
  it('exposes Life Timeline as a first-class lazy-loaded route', async () => {
    render(createElement(App))

    fireEvent.click(screen.getByRole('button', { name: /Life Timeline/ }))

    expect(await screen.findByText('Life Timeline Content')).toBeTruthy()
    expect(mocks.trackPageView).toHaveBeenLastCalledWith(
      '/life-timeline',
      'Cinnabar — Life Timeline',
    )
  })
})
