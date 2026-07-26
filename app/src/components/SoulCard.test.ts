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
import type { FunctionalAstrolabe } from '@/lib/astro'
import { useChartStore } from '@/stores'
import { SoulCard } from './SoulCard'

const mocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  qrToDataURL: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,soul-card'),
  writeText: vi.fn(),
}))

vi.mock('html2canvas', () => ({
  default: mocks.html2canvas,
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: mocks.qrToDataURL,
  },
}))

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
  mocks.qrToDataURL.mockReset()
  mocks.toDataURL.mockClear()
  mocks.writeText.mockReset()
  mocks.html2canvas.mockResolvedValue({ toDataURL: mocks.toDataURL })
  mocks.qrToDataURL.mockReturnValue(new Promise(() => undefined))
  mocks.writeText.mockResolvedValue(undefined)

  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  })
  useChartStore.setState({ chart: CHART, birthInfo: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SoulCard', () => {
  it('renders the card to a doubled PNG and removes its download anchor', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    render(createElement(SoulCard))

    fireEvent.click(screen.getByRole('button', { name: /Image/ }))

    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce()
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
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('cinnabar-soul-card.png')
    expect(document.body.contains(anchor)).toBe(false)
  })

  it('contains duplicate image exports while generation is in flight', async () => {
    let finishExport: ((value: { toDataURL: typeof mocks.toDataURL }) => void)
      | undefined
    mocks.html2canvas.mockImplementationOnce(() => new Promise((resolve) => {
      finishExport = resolve
    }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    render(createElement(SoulCard))

    const imageButton = screen.getByRole('button', { name: /Image/ })
    fireEvent.click(imageButton)
    fireEvent.click(imageButton)

    await waitFor(() => {
      expect(mocks.html2canvas).toHaveBeenCalledOnce()
    })
    expect((imageButton as HTMLButtonElement).disabled).toBe(true)

    finishExport?.({ toDataURL: mocks.toDataURL })
    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce()
    })
    expect((imageButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('announces an image failure and recovers on retry without a browser alert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const browserAlert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementationOnce(() => {
        throw new Error('private download detail')
      })
      .mockImplementation(() => undefined)
    render(createElement(SoulCard))

    fireEvent.click(screen.getByRole('button', { name: /Image/ }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toBe("We couldn't save this image. Please try again.")
    expect(error.textContent).not.toContain('private download detail')
    expect(browserAlert).not.toHaveBeenCalled()
    const failedAnchor = click.mock.instances[0] as HTMLAnchorElement
    expect(document.body.contains(failedAnchor)).toBe(false)

    const imageButton = screen.getByRole('button', { name: /Image/ })
    expect(imageButton.getAttribute('aria-describedby')).toBe(
      'soul-card-download-error',
    )
    fireEvent.click(imageButton)

    await waitFor(() => {
      expect(click).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByText("We couldn't save this image. Please try again."))
      .toBeNull()
  })

  it('announces copy success and provides a manual fallback after failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    render(createElement(SoulCard))

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(
      "We couldn't copy the link. Copy this address manually:",
    )
    expect(error.textContent).toContain('https://cinnabarastrology.com')
    const copyButton = screen.getByRole('button', { name: 'Copy link' })
    expect(copyButton.getAttribute('aria-describedby')).toBe(
      'soul-card-copy-feedback',
    )

    fireEvent.click(copyButton)

    expect((await screen.findByRole('status')).textContent).toBe(
      'Share link copied.',
    )
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeTruthy()
    expect(mocks.writeText).toHaveBeenCalledTimes(2)
    expect(mocks.writeText).toHaveBeenLastCalledWith(
      expect.stringContaining('https://cinnabarastrology.com'),
    )
  })
})
