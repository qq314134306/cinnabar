// @vitest-environment jsdom

import { createElement } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailCapture } from './EmailCapture'

const mocks = vi.hoisted(() => ({
  subscribeEmail: vi.fn(),
  emailCapture: vi.fn(),
}))

vi.mock('@/lib/subscribe', () => ({
  isValidEmail: (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
  subscribeEmail: mocks.subscribeEmail,
}))

vi.mock('@/lib/analytics', () => ({
  analytics: {
    emailCapture: mocks.emailCapture,
  },
}))

function submitForm() {
  const button = screen.getByRole('button')
  const form = button.closest('form')
  if (!form) throw new Error('Expected the email form')
  fireEvent.submit(form)
}

beforeEach(() => {
  mocks.subscribeEmail.mockReset()
  mocks.emailCapture.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('EmailCapture', () => {
  it('announces invalid input without making a request', () => {
    render(createElement(EmailCapture, { source: 'reading' }))
    const input = screen.getByRole('textbox', {
      name: 'Email address',
    }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'not-an-email' } })
    submitForm()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Please enter a valid email address.')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(alert.id)
    expect(mocks.subscribeEmail).not.toHaveBeenCalled()
  })

  it('clears a request error when the user edits the address', async () => {
    mocks.subscribeEmail.mockRejectedValueOnce(
      new Error('Subscriptions are temporarily unavailable.'),
    )
    render(createElement(EmailCapture, { source: 'exit_intent' }))
    const input = screen.getByRole('textbox', {
      name: 'Email address',
    }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'reader@example.com' } })
    submitForm()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Subscriptions are temporarily unavailable.',
    )
    fireEvent.change(input, { target: { value: 'reader2@example.com' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('reports success and calls the optional unlock callback once', async () => {
    mocks.subscribeEmail.mockResolvedValueOnce(undefined)
    const onSuccess = vi.fn()
    render(createElement(EmailCapture, {
      source: 'soul_card',
      onSuccess,
    }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'reader@example.com' },
    })
    submitForm()

    expect((await screen.findByRole('status')).textContent).toContain(
      "You're on the list",
    )
    expect(mocks.subscribeEmail).toHaveBeenCalledWith(
      'reader@example.com',
      'soul_card',
    )
    expect(mocks.emailCapture).toHaveBeenCalledWith('soul_card')
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('blocks duplicate submissions while the first request is pending', async () => {
    let resolveRequest: (() => void) | undefined
    mocks.subscribeEmail.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRequest = resolve
    }))
    render(createElement(EmailCapture, { source: 'reading' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'reader@example.com' },
    })
    submitForm()
    submitForm()

    expect(mocks.subscribeEmail).toHaveBeenCalledOnce()
    expect(
      (screen.getByRole('button', { name: 'Sending' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await act(async () => {
      resolveRequest?.()
      await Promise.resolve()
    })
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
