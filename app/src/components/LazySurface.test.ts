// @vitest-environment jsdom

import { createElement, lazy } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LazySurface } from './LazySurface'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LazySurface', () => {
  it('announces a pending lazy surface', () => {
    const Pending = lazy(
      () => new Promise<{ default: () => null }>(() => undefined),
    )

    render(
      createElement(
        LazySurface,
        {
          label: 'Compatibility',
          loadingLabel: 'Loading Compatibility…',
        },
        createElement(Pending),
      ),
    )

    expect(screen.getByRole('status').textContent).toContain(
      'Loading Compatibility…',
    )
  })

  it('contains a render failure and offers an explicit reload action', () => {
    const onReload = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    function BrokenSurface(): never {
      throw new Error('test chunk failure')
    }

    render(
      createElement(
        LazySurface,
        {
          label: 'Share Card',
          loadingLabel: 'Loading Share Card…',
          onReload,
        },
        createElement(BrokenSurface),
      ),
    )

    expect(screen.getByRole('alert').textContent).toContain(
      "We couldn't load Share Card.",
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })
})
