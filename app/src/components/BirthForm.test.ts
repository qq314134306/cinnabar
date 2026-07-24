// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChartStore } from '@/stores'
import { BirthForm } from './BirthForm'

const mocks = vi.hoisted(() => ({
  findBirthplaceAsync: vi.fn(),
  resolveBirthTimeAsync: vi.fn(),
  viewLanding: vi.fn(),
}))

vi.mock('@/lib/true-solar-time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/true-solar-time')>(
    '@/lib/true-solar-time',
  )
  return {
    ...actual,
    findBirthplaceAsync: mocks.findBirthplaceAsync,
    resolveBirthTimeAsync: mocks.resolveBirthTimeAsync,
  }
})

vi.mock('@/lib/analytics', () => ({
  analytics: {
    viewLanding: mocks.viewLanding,
  },
}))

beforeEach(() => {
  mocks.findBirthplaceAsync.mockReset()
  mocks.findBirthplaceAsync.mockResolvedValue(null)
  mocks.resolveBirthTimeAsync.mockReset()
  mocks.viewLanding.mockReset()
  useChartStore.setState({ birthInfo: null, chart: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BirthForm', () => {
  it('gives every birth-date field an accessible name', () => {
    render(createElement(BirthForm))

    expect(screen.getByRole('combobox', { name: 'Year of birth' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Month of birth' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Day of birth' })).toBeTruthy()
  })

  it('defaults solar correction off for an approximate time and stores the uncertainty', async () => {
    mocks.resolveBirthTimeAsync.mockResolvedValueOnce({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      timeIndex: 6,
      originalShichen: '午时',
      correctedShichen: '午时',
      correctionMinutes: 0,
      applied: false,
      crossedDate: false,
      location: null,
    })
    render(createElement(BirthForm))

    fireEvent.change(screen.getByRole('combobox', {
      name: 'How accurate is this time?',
    }), {
      target: { value: 'approximate' },
    })

    const correction = screen.getByRole('checkbox', {
      name: /Auto true solar time correction/,
    }) as HTMLInputElement
    expect(correction.checked).toBe(false)
    expect(screen.getByText(
      'Off by default for an approximate time. You can enable it for comparison.',
    )).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cast My Chart' }))

    await waitFor(() => {
      expect(useChartStore.getState().chart).not.toBeNull()
    })
    expect(mocks.resolveBirthTimeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
    expect(useChartStore.getState().birthInfo?.birthTimeReliable).toBe(false)
  })

  it('lets an approximate-time user explicitly re-enable solar correction', () => {
    render(createElement(BirthForm))

    fireEvent.change(screen.getByRole('combobox', {
      name: 'How accurate is this time?',
    }), {
      target: { value: 'approximate' },
    })
    const correction = screen.getByRole('checkbox', {
      name: /Auto true solar time correction/,
    }) as HTMLInputElement

    fireEvent.click(correction)

    expect(correction.checked).toBe(true)
    expect(screen.getByText(
      'Enabled by you. Each nearby time window will be corrected separately.',
    )).toBeTruthy()
  })

  it('shows a recoverable error when chart generation cannot complete', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.resolveBirthTimeAsync.mockRejectedValueOnce(new Error('test failure'))
    render(createElement(BirthForm))

    fireEvent.click(screen.getByRole('button', { name: 'Cast My Chart' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      "We couldn't cast this chart. Check the birth details and try again.",
    )
    await waitFor(() => {
      expect(
        (screen.getByRole('button', {
          name: 'Cast My Chart',
        }) as HTMLButtonElement).disabled,
      ).toBe(false)
    })
    expect(useChartStore.getState().chart).toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('clears a prior error and stores the chart after a successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.resolveBirthTimeAsync
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        year: 1990,
        month: 1,
        day: 1,
        hour: 12,
        minute: 0,
        timeIndex: 6,
        originalShichen: '午时',
        correctedShichen: '午时',
        correctionMinutes: 0,
        applied: false,
        crossedDate: false,
        location: null,
      })
    render(createElement(BirthForm))

    fireEvent.click(screen.getByRole('button', { name: 'Cast My Chart' }))
    expect(await screen.findByRole('alert')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cast My Chart' }))

    await waitFor(() => {
      expect(useChartStore.getState().chart).not.toBeNull()
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(useChartStore.getState().birthInfo).toMatchObject({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      gender: 'male',
    })
  })

  it('contains a birthplace lookup failure and recovers after the city changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.findBirthplaceAsync
      .mockRejectedValueOnce(new Error('private chunk detail'))
      .mockResolvedValueOnce({
        name: 'London',
        country: 'United Kingdom',
        enName: 'London',
        longitude: -0.1276,
        tz: 'Europe/London',
      })
    render(createElement(BirthForm))

    const birthplaceInput = screen.getByRole('textbox', {
      name: 'Birthplace (optional)',
    })
    fireEvent.change(birthplaceInput, { target: { value: 'London' } })

    const lookupStatus = await screen.findByRole('status')
    expect(lookupStatus.textContent).toBe(
      'City matching is temporarily unavailable. Edit the city to retry, or turn off correction to cast without it.',
    )
    expect(lookupStatus.textContent).not.toContain('private chunk detail')
    expect(birthplaceInput.getAttribute('aria-describedby')).toBe(lookupStatus.id)

    fireEvent.change(birthplaceInput, { target: { value: 'London ' } })

    expect(await screen.findByText(
      'Matched London, United Kingdom — true solar time will be fine-tuned automatically.',
    )).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(mocks.findBirthplaceAsync).toHaveBeenCalledTimes(2)
  })
})
