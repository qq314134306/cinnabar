/** @vitest-environment jsdom */

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthModal } from './AuthModal'

const mocks = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  verifyEmailOtp: vi.fn(),
}))

vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    signInWithEmail: mocks.signInWithEmail,
    signInWithOAuth: mocks.signInWithOAuth,
    verifyEmailOtp: mocks.verifyEmailOtp,
  }),
}))

vi.mock('@/components/SocialSignInButton', () => ({
  SocialSignInButton: () => null,
}))

describe('AuthModal email OTP flow', () => {
  beforeEach(() => {
    mocks.signInWithEmail.mockReset()
    mocks.signInWithOAuth.mockReset()
    mocks.verifyEmailOtp.mockReset()
    mocks.signInWithEmail.mockResolvedValue({
      accepted: true,
      authMode: 'opaque',
      verificationCsrfToken: 'verify-email',
    })
    mocks.verifyEmailOtp.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the original email, accepts a pasted ASCII OTP, and verifies in memory', async () => {
    const onClose = vi.fn()
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')
    render(createElement(AuthModal, { onClose }))

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: ' reader@example.com ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    const otpInput = await screen.findByLabelText('6-digit verification code')
    expect(screen.getByText('reader@example.com')).toBeTruthy()
    expect(screen.getByText('You can also use the secure link in your email.')).toBeTruthy()
    expect(otpInput.getAttribute('inputmode')).toBe('numeric')
    expect(otpInput.getAttribute('autocomplete')).toBe('one-time-code')

    const verifyButton = screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement
    expect(verifyButton.disabled).toBe(true)

    fireEvent.change(otpInput, { target: { value: '12a３456' } })
    expect((otpInput as HTMLInputElement).value).toBe('12456')
    fireEvent.submit(otpInput.closest('form') as HTMLFormElement)
    expect(mocks.verifyEmailOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter the 6-digit code from your email.',
    )

    fireEvent.paste(otpInput, {
      clipboardData: { getData: () => ' 012-345 ' },
    })
    expect((otpInput as HTMLInputElement).value).toBe('012345')
    expect(verifyButton.disabled).toBe(false)

    fireEvent.click(verifyButton)
    await waitFor(() => {
      expect(mocks.verifyEmailOtp).toHaveBeenCalledWith(
        'reader@example.com',
        '012345',
        'verify-email',
      )
    })
    expect(onClose).toHaveBeenCalledOnce()
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('shows only fixed copy when OTP verification fails', async () => {
    mocks.verifyEmailOtp.mockRejectedValue(new Error('vendor invalid otp detail'))
    render(createElement(AuthModal, { onClose: vi.fn() }))

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    const otpInput = await screen.findByLabelText('6-digit verification code')
    fireEvent.change(otpInput, { target: { value: '012345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Verification could not be completed. Please check the code and try again.',
    )
    expect(alert.textContent).not.toContain('vendor')
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull()

    const startAgain = screen.getByRole('button', { name: 'Start again' })
    expect((otpInput as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(startAgain)

    const emailInput = screen.getByLabelText('Email address') as HTMLInputElement
    expect(emailInput.value).toBe('reader@example.com')
    expect(screen.queryByLabelText('6-digit verification code')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    const restartedOtp = await screen.findByLabelText('6-digit verification code')
    expect((restartedOtp as HTMLInputElement).value).toBe('')
  })

  it('preserves the legacy magic-link completion screen when no OTP start is returned', async () => {
    mocks.signInWithEmail.mockResolvedValue(null)
    render(createElement(AuthModal, { onClose: vi.fn() }))

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'legacy@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    expect(await screen.findByText('Check your inbox')).toBeTruthy()
    expect(screen.queryByLabelText('6-digit verification code')).toBeNull()
    expect(mocks.verifyEmailOtp).not.toHaveBeenCalled()
  })

  it('contains keyboard focus and restores it after Escape closes the dialog', () => {
    const origin = document.createElement('button')
    origin.textContent = 'Open sign in'
    document.body.appendChild(origin)
    origin.focus()
    const onClose = vi.fn()
    const view = render(createElement(AuthModal, { onClose }))

    const dialog = screen.getByRole('dialog', { name: 'Sign in to Cinnabar' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const close = screen.getByRole('button', { name: 'Close sign in' })
    const submit = screen.getByRole('button', {
      name: 'Email me a sign-in link',
    })
    expect(document.activeElement).toBe(close)

    submit.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(document.activeElement).toBe(origin)
  })

  it('closes on the true backdrop but not on dialog content', () => {
    const onClose = vi.fn()
    const view = render(createElement(AuthModal, { onClose }))
    const dialog = screen.getByRole('dialog')

    fireEvent.mouseDown(dialog)
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = view.container.firstElementChild
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error('Expected the sign-in backdrop')
    }
    fireEvent.mouseDown(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
