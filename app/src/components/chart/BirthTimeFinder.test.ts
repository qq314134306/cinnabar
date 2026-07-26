// @vitest-environment jsdom

import { createElement } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import * as finder from '@/lib/birth-time-finder'
import type {
  BirthTimeCandidate,
  BirthTimeQuestion,
} from '@/lib/birth-time-finder'
import { BirthTimeFinder } from './BirthTimeFinder'

const BIRTH_INFO: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
  birthplace: 'Chengdu',
  trueSolarEnabled: false,
  birthTimeReliable: false,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('BirthTimeFinder', () => {
  it('runs a local question flow and applies only an explicit candidate', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const candidates = [
      candidate('a', 'Snake Hour', 'morning', 10),
      candidate('b', 'Dog Hour', 'evening', 20),
    ]
    vi.spyOn(finder, 'buildBirthTimeCandidates').mockResolvedValue(candidates)
    vi.spyOn(finder, 'buildBirthTimeQuestionsAsync').mockResolvedValue([
      question('work-1', 'work'),
      question('home-1', 'home'),
      question('move-1', 'relocation'),
    ])
    const onApply = vi.fn()

    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply,
      onClose: vi.fn(),
    }))

    const heading = screen.getByRole('heading', {
      name: 'Compare Life Events Across 13 Time Blocks',
    })
    expect(heading).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(heading.closest('section'))
    })
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', {
      name: /Morning/,
    }))
    fireEvent.click(screen.getByRole('radio', {
      name: 'Family recollection',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))

    expect(await screen.findByText('Question 1 of 3')).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain('Question 1 of 3')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByText('Question 2 of 3')).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain('Question 2 of 3')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByText('Question 3 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(screen.getByText('Most consistent with your answers')).toBeTruthy()
    expect(screen.getByText('+7 evidence points')).toBeTruthy()
    expect(screen.getByText('One-answer removal check')).toBeTruthy()
    expect(screen.getByRole('heading', {
      name: 'Review or change your answers',
    })).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-labelledby')).toBe(
        'birth-time-finder-results-title',
      )
    })
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', {
      name: 'Use Snake Hour, 09:00–10:59',
    }))

    expect(onApply).toHaveBeenCalledWith(candidates[0])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets an early-stop user answer the remaining questions and revise evidence', async () => {
    const candidates = [
      candidate('a', 'Snake Hour', 'morning', 10),
      candidate('b', 'Dog Hour', 'evening', 20),
    ]
    vi.spyOn(finder, 'buildBirthTimeCandidates').mockResolvedValue(candidates)
    vi.spyOn(finder, 'buildBirthTimeQuestionsAsync').mockResolvedValue([
      question('work-1', 'work'),
      question('home-1', 'home'),
      question('move-1', 'relocation'),
      question('leadership-1', 'leadership'),
      question('partnership-1', 'partnership'),
    ])

    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply: vi.fn(),
      onClose: vi.fn(),
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))
    await screen.findByText('Question 1 of 5')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(await screen.findByRole('button', {
      name: 'Ask remaining 2',
    })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {
      name: 'Ask remaining 2',
    }))
    expect(await screen.findByText('Question 4 of 5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByText('Question 5 of 5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(await screen.findByText('+10 evidence points')).toBeTruthy()
    expect(screen.queryByRole('button', {
      name: /Ask remaining/,
    })).toBeNull()
    expect(screen.getAllByRole('button', {
      name: /^Change question/,
    })).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', {
      name: 'Change question 1 answer to No',
    }))
    expect(screen.getByText('+7 evidence points')).toBeTruthy()
  })

  it('keeps exact-place preparation failures inside the tool', async () => {
    vi.spyOn(finder, 'buildBirthTimeCandidates').mockRejectedValue(
      new finder.BirthTimeFinderInputError(
        'Birthplace could not be matched exactly.',
      ),
    )
    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply: vi.fn(),
      onClose: vi.fn(),
    }))

    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Birthplace could not be matched exactly.',
    )
    expect(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    })).toBeTruthy()
  })

  it('closes on Escape without applying a candidate', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply,
      onClose,
    }))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('does not expose an arbitrary candidate when answers cannot separate groups', async () => {
    const candidates = [
      candidate('a', 'A Hour', 'morning', 10),
      candidate('b', 'B Hour', 'evening', 20),
      candidate('c', 'C Hour', 'overnight', 0),
      candidate('d', 'D Hour', 'daytime', 14),
    ]
    vi.spyOn(finder, 'buildBirthTimeCandidates').mockResolvedValue(candidates)
    vi.spyOn(finder, 'buildBirthTimeQuestionsAsync').mockResolvedValue([
      question('work-1', 'work'),
      question('home-1', 'home'),
      question('move-1', 'relocation'),
    ])

    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply: vi.fn(),
      onClose: vi.fn(),
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))
    await screen.findByText('Question 1 of 3')
    fireEvent.click(screen.getByRole('button', {
      name: 'Prefer not to answer',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prefer not to answer',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prefer not to answer',
    }))

    expect((await screen.findByRole('status')).textContent).toContain(
      'has not narrowed or recommended a candidate',
    )
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('keeps a tied cutoff transparent instead of choosing an arbitrary third card', async () => {
    const candidates = [
      candidate('a', 'A Hour', 'morning', 10),
      candidate('b', 'B Hour', 'evening', 20),
      candidate('c', 'C Hour', 'overnight', 0),
      candidate('d', 'D Hour', 'daytime', 14),
    ]
    vi.spyOn(finder, 'buildBirthTimeCandidates').mockResolvedValue(candidates)
    vi.spyOn(finder, 'buildBirthTimeQuestionsAsync').mockResolvedValue([
      questionWithSignals('work-1', 'work', {
        a: 1, b: 0, c: 0, d: 0,
      }),
      questionWithSignals('home-1', 'home', {
        a: 1, b: 1, c: 0, d: 0,
      }),
      questionWithSignals('move-1', 'relocation', {
        a: 1, b: 0, c: 1, d: 1,
      }),
    ])

    render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply: vi.fn(),
      onClose: vi.fn(),
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))
    await screen.findByText('Question 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(screen.getByRole('button', {
      name: 'Use A Hour, 09:00–10:59',
    })).toBeTruthy()
    expect(screen.queryByRole('button', {
      name: 'Use B Hour, 19:00–20:59',
    })).toBeNull()
    expect(screen.getByText(/tied across B Hour, C Hour, D Hour/)).toBeTruthy()
  })

  it('invalidates a pending preparation when the tool unmounts', async () => {
    const pendingCandidates = deferred<BirthTimeCandidate[]>()
    const buildCandidates = vi.spyOn(finder, 'buildBirthTimeCandidates')
      .mockImplementation(() => pendingCandidates.promise)
    const buildQuestions = vi.spyOn(finder, 'buildBirthTimeQuestionsAsync')
    const view = render(createElement(BirthTimeFinder, {
      birthInfo: BIRTH_INFO,
      onApply: vi.fn(),
      onClose: vi.fn(),
    }))

    fireEvent.click(screen.getByRole('button', {
      name: 'Prepare 13 Time Blocks',
    }))
    const shouldContinue = buildCandidates.mock.calls[0]?.[2]
    expect(shouldContinue?.()).toBe(true)
    view.unmount()
    expect(shouldContinue?.()).toBe(false)
    pendingCandidates.resolve([candidate('a', 'A Hour', 'morning', 10)])
    await Promise.resolve()

    expect(buildQuestions).not.toHaveBeenCalled()
  })
})

function candidate(
  key: string,
  label: string,
  daypart: finder.RecallDaypart,
  hour: number,
): BirthTimeCandidate {
  return {
    id: key,
    block: {
      id: key,
      label,
      range: hour === 10 ? '09:00–10:59' : '19:00–20:59',
      hour,
      daypart,
    },
    input: {
      year: 1990,
      month: 1,
      day: 1,
      hour,
    },
    birthInfo: {
      ...BIRTH_INFO,
      hour,
      trueSolarEnabled: true,
      birthTimeReliable: false,
    },
    resolved: {
      year: 1990,
      month: 1,
      day: 1,
      hour,
      minute: 0,
      timeIndex: Math.floor((hour + 1) / 2) % 12,
      originalShichen: '子时',
      correctedShichen: '子时',
      correctionMinutes: -10,
      applied: true,
      crossedDate: false,
      location: null,
    },
    chart: {} as FunctionalAstrolabe,
    groupKey: key,
  }
}

function question(
  id: string,
  domain: BirthTimeQuestion['domain'],
): BirthTimeQuestion {
  return {
    id,
    domain,
    startYear: 2017,
    endYear: 2019,
    prompt: `Did ${domain} change?`,
    signals: { a: 1, b: -1 },
    discrimination: 100,
  }
}

function questionWithSignals(
  id: string,
  domain: BirthTimeQuestion['domain'],
  signals: Record<string, -1 | 0 | 1>,
): BirthTimeQuestion {
  return {
    ...question(id, domain),
    signals,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
