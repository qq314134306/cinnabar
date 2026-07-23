// @vitest-environment jsdom

import { createElement } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreditWalletData } from '@/lib/credits'

const mocks = vi.hoisted(() => ({
  loadCreditWallet: vi.fn(),
  viewWallet: vi.fn(),
}))

vi.mock('@/lib/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/credits')>()
  return {
    ...actual,
    loadCreditWallet: mocks.loadCreditWallet,
  }
})

vi.mock('@/lib/analytics', () => ({
  analytics: {
    viewWallet: mocks.viewWallet,
  },
}))

import { CreditWallet } from '@/components/CreditWallet'

const READY_WALLET: CreditWalletData = {
  balance: 21,
  transactions: [
    {
      id: '2',
      amount: -9,
      entryType: 'debit',
      createdAt: '2026-07-23T12:00:00.000Z',
    },
    {
      id: '1',
      amount: 30,
      entryType: 'registration_grant',
      createdAt: '2026-07-22T12:00:00.000Z',
    },
  ],
}

function renderWallet(
  userId = 'user-1',
  sessionVersion = 'session-1',
  legacyAccessToken: string | null = null,
) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  const result = render(
    createElement(CreditWallet, {
      userId,
      sessionVersion,
      legacyAccessToken,
    }),
    { container: root },
  )
  return { root, ...result }
}

describe('CreditWallet behavior', () => {
  beforeEach(() => {
    mocks.loadCreditWallet.mockReset()
    mocks.viewWallet.mockReset()
  })

  afterEach(() => {
    cleanup()
    document.body.replaceChildren()
  })

  it('isolates the app, opens once, closes on Escape, and restores focus/background', async () => {
    mocks.loadCreditWallet.mockResolvedValue(READY_WALLET)
    const { root } = renderWallet()
    const trigger = await screen.findByRole('button', {
      name: 'Credits wallet, 21 credits',
    })
    trigger.focus()

    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Your credits' })
    expect(dialog).toBeTruthy()
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close credits wallet' }),
    )
    expect(mocks.viewWallet).toHaveBeenCalledOnce()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(root.hasAttribute('aria-hidden')).toBe(false)
      expect(root.hasAttribute('inert')).toBe(false)
      expect(document.body.style.overflow).toBe('')
      expect(document.activeElement).toBe(trigger)
    })
    expect(mocks.viewWallet).toHaveBeenCalledOnce()
  })

  it('closes on a backdrop pointer action and restores the trigger focus', async () => {
    mocks.loadCreditWallet.mockResolvedValue(READY_WALLET)
    renderWallet()
    const trigger = await screen.findByRole('button', {
      name: 'Credits wallet, 21 credits',
    })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Your credits' })
    const backdrop = dialog.parentElement
    expect(backdrop).not.toBeNull()

    fireEvent.pointerDown(backdrop as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('traps focus and retries a failed, friendly wallet load', async () => {
    mocks.loadCreditWallet
      .mockRejectedValueOnce(new Error('raw database diagnostic'))
      .mockResolvedValueOnce(READY_WALLET)
    renderWallet()
    const trigger = screen.getByRole('button', { name: 'Open credits wallet' })
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).toBe('false'))

    fireEvent.click(trigger)

    expect(await screen.findByText('Credits are temporarily unavailable.')).toBeTruthy()
    expect(screen.queryByText('raw database diagnostic')).toBeNull()
    const close = screen.getByRole('button', { name: 'Close credits wallet' })
    const retry = screen.getByRole('button', { name: 'Try again' })

    retry.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(retry)

    fireEvent.click(retry)

    expect(await screen.findByText('Current balance')).toBeTruthy()
    expect(screen.getByText('Credits used')).toBeTruthy()
    expect(mocks.loadCreditWallet).toHaveBeenNthCalledWith(1)
    expect(mocks.loadCreditWallet).toHaveBeenNthCalledWith(2)
  })

  it('shows an empty state when the safe account API has no activity', async () => {
    mocks.loadCreditWallet.mockResolvedValue({ balance: 0, transactions: [] })
    renderWallet()
    const trigger = await screen.findByRole('button', {
      name: 'Credits wallet, 0 credits',
    })

    fireEvent.click(trigger)

    expect(await screen.findByText('No credit activity yet.')).toBeTruthy()
  })

  it('passes the in-memory token only for a legacy wallet session', async () => {
    mocks.loadCreditWallet.mockResolvedValue(READY_WALLET)
    renderWallet('legacy-user', 'legacy:legacy-user:active', 'legacy-access')

    await screen.findByRole('button', {
      name: 'Credits wallet, 21 credits',
    })
    expect(mocks.loadCreditWallet).toHaveBeenCalledWith(
      expect.any(Function),
      'legacy-access',
    )
  })

  it('remounts its session boundary on account changes without retaining prior data', async () => {
    mocks.loadCreditWallet
      .mockResolvedValueOnce(READY_WALLET)
      .mockResolvedValueOnce({ balance: 55, transactions: [] })
    const { rerender } = renderWallet()
    expect(await screen.findByRole('button', {
      name: 'Credits wallet, 21 credits',
    })).toBeTruthy()

    rerender(createElement(CreditWallet, {
      userId: 'user-2',
      sessionVersion: 'session-2',
    }))

    expect(screen.getByRole('button', { name: 'Open credits wallet' })).toBeTruthy()
    expect(await screen.findByRole('button', {
      name: 'Credits wallet, 55 credits',
    })).toBeTruthy()
    expect(mocks.loadCreditWallet).toHaveBeenNthCalledWith(1)
    expect(mocks.loadCreditWallet).toHaveBeenNthCalledWith(2)
  })
})
