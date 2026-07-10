/* ============================================================
   Birth details form
   ============================================================ */

import { useEffect, useState } from 'react'
import { Button, Input, Select } from '@/components/ui'
import { generateChart, getShichenOptions, type BirthInfo, type Gender } from '@/lib/astro'
import { clampDayToMonth, getDayOptions, getMonthOptions, getYearOptions } from '@/lib/birth-date'
import { findBirthplaceAsync, resolveBirthTimeAsync, type Birthplace } from '@/lib/true-solar-time'
import { useChartStore } from '@/stores'

const YEAR_OPTIONS = getYearOptions()
const MONTH_OPTIONS = getMonthOptions()
const HOUR_OPTIONS = getShichenOptions()

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male', icon: '♂' },
  { value: 'female', label: 'Female', icon: '♀' },
]

export function BirthForm() {
  const { setBirthInfo, setChart } = useChartStore()

  const [year, setYear] = useState(1990)
  const [month, setMonth] = useState(1)
  const [day, setDay] = useState(1)
  const [hour, setHour] = useState(12)
  const [gender, setGender] = useState<Gender>('male')
  const [birthplace, setBirthplace] = useState('')
  const [trueSolarEnabled, setTrueSolarEnabled] = useState(true)
  const [matchedBirthplace, setMatchedBirthplace] = useState<Birthplace | null>(null)
  const [matchingBirthplace, setMatchingBirthplace] = useState(false)
  const [loading, setLoading] = useState(false)

  const dayOptions = getDayOptions(year, month)

  useEffect(() => {
    let active = true
    const trimmedBirthplace = birthplace.trim()

    if (!trueSolarEnabled || !trimmedBirthplace) {
      setMatchedBirthplace(null)
      setMatchingBirthplace(false)
      return
    }

    setMatchingBirthplace(true)
    findBirthplaceAsync(trimmedBirthplace)
      .then((place) => {
        if (active) setMatchedBirthplace(place)
      })
      .finally(() => {
        if (active) setMatchingBirthplace(false)
      })

    return () => {
      active = false
    }
  }, [birthplace, trueSolarEnabled])

  const handleYearChange = (nextYear: number) => {
    setYear(nextYear)
    setDay((currentDay) => clampDayToMonth(nextYear, month, currentDay))
  }

  const handleMonthChange = (nextMonth: number) => {
    setMonth(nextMonth)
    setDay((currentDay) => clampDayToMonth(year, nextMonth, currentDay))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const safeDay = clampDayToMonth(year, month, day)
      const resolvedBirthTime = await resolveBirthTimeAsync({
        year,
        month,
        day: safeDay,
        hour,
        birthplace,
        enabled: trueSolarEnabled,
      })
      const birthInfo: BirthInfo = {
        year,
        month,
        day: safeDay,
        hour,
        gender,
        birthplace: birthplace.trim() || undefined,
        trueSolarEnabled,
        resolvedBirthTime,
      }
      const chart = generateChart(birthInfo)

      setBirthInfo(birthInfo)
      setChart(chart)
    } catch (error) {
      console.error('Chart generation failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="
        relative w-full max-w-lg p-8
        bg-gradient-to-br from-white/[0.06] to-white/[0.02]
        backdrop-blur-xl border border-white/[0.08] rounded-2xl
        shadow-[0_8px_40px_rgba(0,0,0,0.3)]
      "
    >
      {/* Top glow line */}
      <div
        className="
          absolute top-0 left-1/2 -translate-x-1/2
          w-1/2 h-px
          bg-gradient-to-r from-transparent via-cinnabar/40 to-transparent
        "
      />

      {/* Title */}
      <div className="text-center mb-8">
        <h2
          className="
            text-2xl font-semibold mb-2
            bg-gradient-to-r from-text via-text-secondary to-text
            bg-clip-text text-transparent
          "
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Your Birth Chart Knows You
        </h2>
        <p className="text-sm text-text-muted">
          Share your birth date and time — Cinnabar casts your real chart.
        </p>
      </div>

      <div className="space-y-6">
        {/* Birth date */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary font-medium">Date of Birth</span>
            <span
              className="
                text-xs px-2.5 py-1 rounded-full
                bg-gradient-to-r from-gold/20 to-gold/10
                text-gold border border-gold/20
              "
            >
              Western calendar
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              options={YEAR_OPTIONS}
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
            />
            <Select
              options={MONTH_OPTIONS}
              value={month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
            />
            <Select
              options={dayOptions}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Birth hour */}
        <Select
          label="Time of Birth"
          options={HOUR_OPTIONS}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
        />

        {/* Gender */}
        <div className="space-y-2">
          <span className="text-sm text-text-secondary font-medium">Gender</span>
          <div className="flex gap-3">
            {GENDER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`
                  group relative flex-1 py-3 px-4 rounded-xl
                  flex items-center justify-center gap-2
                  cursor-pointer transition-all duration-200
                  ${gender === opt.value
                    ? 'bg-gradient-to-r from-star to-star-dark text-white shadow-[0_4px_20px_rgba(91,58,140,0.3)]'
                    : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]'
                  }
                `}
              >
                <input
                  type="radio"
                  name="gender"
                  value={opt.value}
                  checked={gender === opt.value}
                  onChange={() => setGender(opt.value as Gender)}
                  className="sr-only"
                />
                <span
                  className={`
                    text-lg transition-transform duration-200
                    ${gender === opt.value ? 'scale-110' : 'opacity-60 group-hover:opacity-80'}
                  `}
                >
                  {opt.icon}
                </span>
                <span className="font-medium">{opt.label}</span>
                {gender === opt.value && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gold shadow-[0_0_8px_rgba(201,162,75,0.6)]" />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Birthplace (optional) */}
        <Input
          label="Birthplace (optional)"
          placeholder="e.g. Beijing, Chengdu, Shanghai"
          hint={
            trueSolarEnabled
              ? matchingBirthplace
                ? 'Matching your birthplace...'
                : matchedBirthplace
                ? `Matched ${matchedBirthplace.name} — true solar time will be corrected automatically.`
                : birthplace.trim()
                  ? 'No match found for this birthplace; the chart will use your entered time as-is.'
                  : 'Type your birthplace and it will be matched automatically.'
              : 'True solar time correction is off.'
          }
          value={birthplace}
          onChange={(e) => setBirthplace(e.target.value)}
        />

        <label
          className="
            flex items-center justify-between gap-4 rounded-xl
            bg-white/[0.04] border border-white/[0.08]
            px-4 py-3 cursor-pointer
          "
        >
          <span>
            <span className="block text-sm text-text-secondary font-medium">Auto true solar time correction</span>
            <span className="block text-xs text-text-muted mt-0.5">
              Handled from your birthplace — no coordinates needed.
            </span>
          </span>
          <input
            type="checkbox"
            checked={trueSolarEnabled}
            onChange={(e) => setTrueSolarEnabled(e.target.checked)}
            className="h-5 w-5 accent-star"
          />
        </label>

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.06]" />
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          variant="gold"
          size="lg"
          className="w-full group"
          disabled={loading}
        >
          {loading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Casting your chart...
            </>
          ) : (
            <>
              <span>Cast My Chart</span>
              <svg
                className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </Button>
      </div>

      {/* Footnote */}
      <p className="text-xs text-text-muted text-center mt-6 flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-star-light" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        Enter your Western (Gregorian) birth date — it is converted to the lunar calendar automatically.
      </p>

      {/* Corner ornament */}
      <div className="absolute -bottom-2 -right-2 w-16 h-16 opacity-20">
        <div className="absolute inset-0 rounded-full border border-star/30" />
        <div className="absolute inset-2 rounded-full border border-gold/20" />
        <div className="absolute inset-4 rounded-full border border-star/10" />
      </div>
    </form>
  )
}
