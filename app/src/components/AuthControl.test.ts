// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthControl } from './AuthControl'

const mocks = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; email: string } | null,
    authMode: 'legacy' as 'legacy' | 'dual' | 'opaque' | null,
    sessionVersion: null as number | null,
    legacyAccessToken: null as string | null,
    initialized: true,
    error: null as string | null,
    init: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('@/stores', () => ({
  useAuthStore: () => mocks.authState,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
}))

vi.mock('@/components/AuthModal', () => ({
  AuthModal: () => createElement('div', null, 'AUTH MODAL'),
}))

vi.mock('@/components/CreditWallet', () => ({
  CreditWallet: () => null,
}))

beforeEach(() => {
  mocks.authState.user = null
  mocks.authState.authMode = 'legacy'
  mocks.authState.sessionVersion = null
  mocks.authState.legacyAccessToken = null
  mocks.authState.initialized = true
  mocks.authState.error = null
  mocks.authState.init.mockReset()
  mocks.authState.signOut.mockReset()
  mocks.authState.signOut.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('AuthControl feedback', () => {
  it('offers session retry while cookie authority is unknown without crowding mobile', () => {
    mocks.authState.initialized = false
    mocks.authState.authMode = null
    mocks.authState.error = 'Authentication is temporarily unavailable.'
    render(createElement(AuthControl))

    fireEvent.click(screen.getByRole('button', { name: 'Retry session' }))

    expect(mocks.authState.init).toHaveBeenCalledOnce()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Authentication is temporarily unavailable.')
    expect(alert.className).toContain('sr-only')
    expect(alert.className).toContain('lg:not-sr-only')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('renders a stable callback failure beside the signed-out control', () => {
    mocks.authState.error = 'Sign-in could not be completed.'
    render(createElement(AuthControl))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Sign-in could not be completed.',
    )
  })

  it('catches sign-out failures and restores a retryable button', async () => {
    mocks.authState.user = { id: 'user-1', email: 'reader@example.com' }
    mocks.authState.sessionVersion = 3
    mocks.authState.signOut.mockRejectedValueOnce(
      new Error('Could not sign out. Please try again.'),
    )
    render(createElement(AuthControl))

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not sign out. Please try again.',
    )
    expect(
      (screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
