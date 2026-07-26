import { useMemo, useState } from 'react'
import type { BirthInfo } from '@/lib/astro'
import { buildDailyTiming } from '@/lib/daily-timing'
import { translateGanZhi, translateStem } from '@/lib/ziwei-glossary'

interface DailyTimingProps {
  birthInfo: BirthInfo
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }
  return date
}

function shiftDate(value: string, days: number): string {
  const date = parseDateInput(value)
  if (!date) return value
  date.setDate(date.getDate() + days)
  return formatDateInput(date)
}

export function DailyTiming({ birthInfo }: DailyTimingProps) {
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()))
  const resolved = birthInfo.resolvedBirthTime

  const result = useMemo(() => {
    const date = parseDateInput(selectedDate)
    if (!resolved || !date || birthInfo.birthTimeUnknown) return null

    return buildDailyTiming({
      birth: {
        year: resolved.year,
        month: resolved.month,
        day: resolved.day,
        timeIndex: resolved.timeIndex,
      },
      selectedDate: {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      },
    })
  }, [birthInfo.birthTimeUnknown, resolved, selectedDate])

  if (!resolved) return null

  return (
    <section
      aria-labelledby="daily-timing-heading"
      className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">
            Date navigator
          </p>
          <h3 id="daily-timing-heading" className="mt-1 text-sm font-semibold text-text">
            Daily Timing
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-secondary">
            Compare a selected day pillar with your natal Day Master. Calculated
            locally from your corrected birth date and the selected calendar day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setSelectedDate((value) => shiftDate(value, -1))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-secondary transition hover:border-gold/30 hover:text-text"
          >
            Previous
          </button>
          <label className="sr-only" htmlFor="daily-timing-date">
            Selected day
          </label>
          <input
            id="daily-timing-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs text-text"
          />
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setSelectedDate((value) => shiftDate(value, 1))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-secondary transition hover:border-gold/30 hover:text-text"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(formatDateInput(new Date()))}
            className="rounded-lg border border-gold/20 bg-gold/[0.06] px-3 py-2 text-xs text-gold"
          >
            Today
          </button>
        </div>
      </div>

      {birthInfo.birthTimeUnknown ? (
        <p role="note" className="mt-3 text-xs leading-relaxed text-gold/80">
          Choose a birth-time candidate before using Daily Timing. A true-solar
          correction can cross the civil-date boundary, so an unknown time cannot
          support a stable natal Day Master.
        </p>
      ) : result ? (
        <div data-daily-timing-result className="mt-3 grid gap-2 sm:grid-cols-3">
          <article className="rounded-lg border border-white/[0.07] p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Selected day
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-text">
              {translateGanZhi(result.dayPillar.ganZhi)}
            </p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {result.dayPillar.polarity} {result.dayPillar.element}
            </p>
          </article>

          <article className="rounded-lg border border-gold/20 bg-gold/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Relation to {translateStem(result.natalDayMaster.stem)}
            </p>
            <p className="mt-1 text-sm font-medium text-gold">
              {result.relationshipLabel}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
              {result.relationshipDescription}
            </p>
          </article>

          <article className="rounded-lg border border-white/[0.07] p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Reading boundary
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              This is a structural Ten Gods comparison, not a rating, prediction,
              or claim about events.
            </p>
          </article>
        </div>
      ) : (
        <p role="alert" className="mt-3 text-xs text-red-300">
          This date could not be calculated. Choose another calendar day.
        </p>
      )}

      {birthInfo.birthTimeReliable === false && !birthInfo.birthTimeUnknown && (
        <p role="note" className="mt-2 text-xs leading-relaxed text-gold/80">
          Your natal time is marked approximate, so this comparison remains
          provisional until the birth-time candidate is confirmed.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
        Dates use this device’s local calendar. The selected day is evaluated at
        noon only to avoid hour-boundary ambiguity; no Hour Pillar is interpreted.
      </p>
    </section>
  )
}
