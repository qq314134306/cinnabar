/* ============================================================
   Birth date option helpers
   ============================================================ */

export interface DateOption {
  value: number
  label: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function getYearOptions(years = 100): DateOption[] {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: years }, (_, i) => {
    const year = currentYear - i
    return { value: year, label: String(year) }
  })
}

export function getMonthOptions(): DateOption[] {
  return MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function getDayOptions(year: number, month: number): DateOption[] {
  const days = getDaysInMonth(year, month)
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    return { value: day, label: String(day) }
  })
}

export function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, getDaysInMonth(year, month))
}
