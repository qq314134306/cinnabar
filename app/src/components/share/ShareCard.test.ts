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
  toBlob: vi.fn((callback: BlobCallback) => {
    callback(new Blob(['share-card'], { type: 'image/png' }))
  }),
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
  mocks.toBlob.mockReset()
  mocks.toBlob.mockImplementation((callback: BlobCallback) => {
    callback(new Blob(['share-card'], { type: 'image/png' }))
  })
  mocks.html2canvas.mockResolvedValue({
    toDataURL: mocks.toDataURL,
    toBlob: mocks.toBlob,
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: undefined,
  })
  useChartStore.setState({ chart: CHART, birthInfo: BIRTH_INFO })
  useContentCacheStore.setState({ aiInterpretation: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShareCard', () => {
  it('offers a useful local default without directing users to AI', () => {
    render(createElement(ShareCard))

    expect(screen.getByText(/Use the default line or customize it below/)).toBeTruthy()
    expect(screen.queryByText(/Get your AI reading first/)).toBeNull()
    expect(screen.getByText(
      '"Your chart holds the map. How you walk it is yours to choose."',
    )).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Share Image' })).toBeNull()
  })

  it('uses an available AI narrative as an optional quote source', () => {
    useContentCacheStore.setState({
      aiInterpretation: '"Steady choices turn insight into a life you can inhabit."',
    })
    render(createElement(ShareCard))

    expect(screen.getByText(
      '"Steady choices turn insight into a life you can inhabit."',
    )).toBeTruthy()
    expect(screen.queryByText(/Use the default line or customize it below/)).toBeNull()
  })

  it('uses an export-stable quote layout and preserves custom copy', () => {
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom quote' }), {
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

  it('cancels a draft without replacing the saved quote', () => {
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom quote' }), {
      target: {
        value: 'The saved line remains when a later draft is cancelled.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const savedQuote = '"The saved line remains when a later draft is cancelled."'
    expect(screen.getByText(savedQuote)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom quote' }), {
      target: {
        value: 'This draft should be discarded.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText(savedQuote)).toBeTruthy()
    expect(screen.queryByText('"This draft should be discarded."')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Custom quote' })).toBeNull()
  })

  it('bounds custom copy to the export-safe length', () => {
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    const quoteInput = screen.getByRole('textbox', {
      name: 'Custom quote',
    }) as HTMLTextAreaElement
    fireEvent.change(quoteInput, {
      target: {
        value: 'x'.repeat(300),
      },
    })

    expect(quoteInput.maxLength).toBe(240)
    expect(quoteInput.value).toHaveLength(240)
    expect(screen.getByText('240 / 240')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    expect(
      (screen.getByRole('textbox', { name: 'Custom quote' }) as HTMLTextAreaElement)
        .value,
    ).toHaveLength(240)
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

  it('shares a generated PNG through the native device share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: canShare,
    })
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Share Image' }))

    await waitFor(() => {
      expect(share).toHaveBeenCalledOnce()
    })
    expect(mocks.html2canvas).toHaveBeenCalledOnce()
    expect(mocks.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
    )
    const shareData = share.mock.calls[0][0] as ShareData
    expect(shareData.title).toBe('My Cinnabar chart')
    expect(shareData.files).toHaveLength(1)
    expect(shareData.files?.[0]).toBeInstanceOf(File)
    expect(shareData.files?.[0]?.name).toBe(
      'cinnabar-reading-geng-wu.png',
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains a prepared image when async capture outlives user activation', async () => {
    const share = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('activation expired'), {
        name: 'NotAllowedError',
      }))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Share Image' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      'Your image is ready.',
    )
    const openShareSheet = screen.getByRole('button', {
      name: 'Open Share Sheet',
    })
    expect(openShareSheet.getAttribute('aria-describedby')).toBe(
      'share-card-share-feedback',
    )

    fireEvent.click(openShareSheet)

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(2)
    })
    expect(mocks.html2canvas).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Share Image' })).toBeTruthy()
  })

  it('discards a prepared share image when the visible quote changes', async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error('activation expired'), {
        name: 'NotAllowedError',
      }),
    )
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Share Image' }))
    expect(await screen.findByRole('status')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', {
      name: '✎ Customize the quote',
    }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom quote' }), {
      target: {
        value: 'A changed quote needs a newly rendered share image.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Share Image' })).toBeTruthy()
    expect(mocks.html2canvas).toHaveBeenCalledOnce()
  })

  it('contains native share failures without exposing browser details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const share = vi.fn().mockRejectedValue(
      new Error('private device integration detail'),
    )
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Share Image' }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(
      "We couldn't share this image. Save it or try again.",
    )
    expect(error.textContent).not.toContain('private device integration detail')
    expect(screen.getByRole('button', {
      name: 'Save Share Image',
    })).toBeTruthy()
  })

  it('contains duplicate exports while one image is being generated', async () => {
    let finishExport: ((value: { toDataURL: typeof mocks.toDataURL }) => void)
      | undefined
    mocks.html2canvas.mockImplementationOnce(() => new Promise((resolve) => {
      finishExport = resolve
    }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    render(createElement(ShareCard))

    const saveButton = screen.getByRole('button', { name: 'Save Share Image' })
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mocks.html2canvas).toHaveBeenCalledOnce()
    })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    finishExport?.({ toDataURL: mocks.toDataURL })
    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce()
    })
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows an announced retry state and recovers after export failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.html2canvas.mockRejectedValueOnce(new Error('canvas unavailable'))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    render(createElement(ShareCard))

    fireEvent.click(screen.getByRole('button', { name: 'Save Share Image' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      "We couldn't create this image. Please try again.",
    )
    const saveButton = screen.getByRole('button', { name: 'Save Share Image' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    expect(saveButton.getAttribute('aria-describedby')).toBe(
      'share-card-download-error',
    )

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce()
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mocks.html2canvas).toHaveBeenCalledTimes(2)
  })
})
