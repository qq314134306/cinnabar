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
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { useChartStore, useContentCacheStore } from '@/stores'
import { ShareCard } from './ShareCard'

const mocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,share-card'),
}))

vi.mock('html2canvas', () => ({
  default: mocks.html2canvas,
}))

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
}

const CHART = {
  fiveElementsClass: '土五局',
  palaces: [
    {
      name: '命宫',
      majorStars: [{ name: '天梁' }],
    },
  ],
} as unknown as FunctionalAstrolabe

beforeEach(() => {
  mocks.html2canvas.mockReset()
  mocks.toDataURL.mockClear()
  mocks.html2canvas.mockResolvedValue({ toDataURL: mocks.toDataURL })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  useChartStore.setState({ chart: CHART, birthInfo: BIRTH_INFO })
  useContentCacheStore.setState({ aiInterpretation: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShareCard', () => {
  it('uses an export-stable quote layout and preserves custom copy', () => {
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: 'Clarity grows when I choose the next honest step.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const quote = screen.getByText(
      '"Clarity grows when I choose the next honest step."',
    ) as HTMLElement
    expect(quote.style.fontFamily).toContain('Georgia')
    expect(quote.style.maxWidth).toBe('288px')
    expect(quote.style.overflowWrap).toBe('break-word')
  })

  it('renders the card to a doubled PNG and triggers its download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Save Share Image' }))

    await waitFor(() => {
      expect(mocks.html2canvas).toHaveBeenCalledOnce()
    })
    expect(mocks.html2canvas).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      {
        backgroundColor: '#12132b',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      },
    )
    expect(mocks.toDataURL).toHaveBeenCalledWith('image/png')
    expect(click).toHaveBeenCalledOnce()
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('cinnabar-reading-geng-wu.png')
    expect(anchor.href).toContain('data:image/png;base64,share-card')
  })
})
