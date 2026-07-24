// @vitest-environment jsdom

import { createElement } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
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
vi.mock('@/components/match/MatchAnalysis', () => ({
  MatchAnalysis: () => createElement('div', null, 'Match Analysis'),
}))
vi.mock('@/components/kline/LifeKLine', () => ({
  LifeKLine: () => createElement('div', null, 'Life Timeline Content'),
}))
vi.mock('@/components/share/ShareCard', () => ({
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
  document.title = ''
})

describe('App navigation', () => {
  it('exposes Life Timeline as a first-class lazy-loaded route', async () => {
    render(createElement(App))

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' })
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile' })
    expect(
      within(primaryNav).getByRole('button', { name: 'Your Chart' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(mobileNav).getByRole('button', { name: 'Your Chart' })
        .getAttribute('aria-current'),
    ).toBe('page')

    fireEvent.click(
      within(primaryNav).getByRole('button', { name: 'Life Timeline' }),
    )

    expect(await screen.findByText('Life Timeline Content')).toBeTruthy()
    expect(
      within(primaryNav).getByRole('button', { name: 'Life Timeline' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(mobileNav).getByRole('button', { name: 'Timeline' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(primaryNav).getByRole('button', { name: 'Your Chart' })
        .hasAttribute('aria-current'),
    ).toBe(false)
    expect(mocks.trackPageView).toHaveBeenLastCalledWith(
      '/life-timeline',
      'Cinnabar — Life Timeline',
    )
    expect(document.title).toBe('Cinnabar — Life Timeline')
  })

  it('loads secondary surfaces on demand and reports their virtual routes', async () => {
    render(createElement(App))

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' })

    fireEvent.click(
      within(primaryNav).getByRole('button', { name: 'Compatibility' }),
    )

    expect(await screen.findByText('Match Analysis')).toBeTruthy()
    expect(
      within(primaryNav).getByRole('button', { name: 'Compatibility' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(mocks.trackPageView).toHaveBeenLastCalledWith(
      '/compatibility',
      'Cinnabar — Compatibility',
    )
    expect(document.title).toBe('Cinnabar — Compatibility')

    fireEvent.click(
      within(primaryNav).getByRole('button', { name: 'Share Card' }),
    )

    expect(await screen.findByText('Share Card Content')).toBeTruthy()
    expect(
      within(primaryNav).getByRole('button', { name: 'Share Card' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(mocks.trackPageView).toHaveBeenLastCalledWith(
      '/share-card',
      'Cinnabar — Share Card',
    )
    expect(document.title).toBe('Cinnabar — Share Card')
  })
})
