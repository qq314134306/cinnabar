// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BirthInfo } from '@/lib/astro'
import { DailyTiming } from './DailyTiming'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
  trueSolarEnabled: false,
  birthTimeReliable: true,
  resolvedBirthTime: {
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
  },
}

afterEach(cleanup)

describe('DailyTiming', () => {
  it('renders a local structural comparison and navigates by day', () => {
    render(createElement(DailyTiming, { birthInfo: BIRTH_INFO }))

    expect(screen.getByRole('heading', { name: 'Daily Timing' })).toBeTruthy()
    expect(document.querySelector('[data-daily-timing-result]')).toBeTruthy()
    expect(screen.getByText(/not a rating, prediction/)).toBeTruthy()

    const dateInput = screen.getByLabelText('Selected day') as HTMLInputElement
    const initialDate = dateInput.value
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(dateInput.value).not.toBe(initialDate)
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(dateInput.value).toBe(initialDate)
  })

  it('locks the result when the birth time is unknown', () => {
    render(createElement(DailyTiming, {
      birthInfo: {
        ...BIRTH_INFO,
        birthTimeUnknown: true,
        birthTimeReliable: false,
      },
    }))

    expect(screen.getByRole('note').textContent).toContain(
      'Choose a birth-time candidate',
    )
    expect(document.querySelector('[data-daily-timing-result]')).toBeNull()
  })
})
