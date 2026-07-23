// @vitest-environment jsdom

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExitIntentModal } from './ExitIntentModal'

vi.mock('@/components/EmailCapture', () => ({
  EmailCapture: ({ onSuccess }: { onSuccess?: () => void }) => createElement(
    'button',
    {
      type: 'button',
      onClick: onSuccess,
    },
    'Complete signup',
  ),
}))

function triggerExitIntent() {
  fireEvent.mouseOut(document, {
    clientY: 0,
    relatedTarget: null,
  })
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ExitIntentModal', () => {
  it('opens once with dialog semantics and moves focus to its close action', () => {
    render(createElement(ExitIntentModal))

    triggerExitIntent()

    const dialog = screen.getByRole('dialog', { name: 'Before you go…' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(sessionStorage.getItem('cinnabar_exit_intent_shown')).toBe('1')
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close email signup' }),
    )
  })

  it('closes on Escape and restores the previously focused control', () => {
    const origin = document.createElement('button')
    origin.textContent = 'Origin'
    document.body.appendChild(origin)
    origin.focus()
    render(createElement(ExitIntentModal))
    triggerExitIntent()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(origin)
  })

  it('keeps Tab focus inside and closes only on the backdrop', () => {
    const view = render(createElement(ExitIntentModal))
    triggerExitIntent()
    const close = screen.getByRole('button', { name: 'Close email signup' })
    const complete = screen.getByRole('button', { name: 'Complete signup' })

    complete.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const backdrop = view.container.firstElementChild
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error('Expected the exit-intent backdrop')
    }
    fireEvent.mouseDown(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not bind another exit trigger after the session flag is present', () => {
    sessionStorage.setItem('cinnabar_exit_intent_shown', '1')
    render(createElement(ExitIntentModal))

    triggerExitIntent()

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes after a successful signup delay', () => {
    vi.useFakeTimers()
    render(createElement(ExitIntentModal))
    triggerExitIntent()

    fireEvent.click(screen.getByRole('button', { name: 'Complete signup' }))
    act(() => vi.advanceTimersByTime(1399))
    expect(screen.getByRole('dialog')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
