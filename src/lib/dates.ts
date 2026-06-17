export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** ISO date string (yyyy-mm-dd) for the Monday of the week containing `d`. */
export function mondayOf(d: Date): string {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7 // 0 = Monday
  date.setDate(date.getDate() - day)
  return toISODate(date)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Human label like "Mon 16 Jun" for a given week start + day offset. */
export function dayLabel(weekStart: string, dayOffset: number): string {
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + dayOffset)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(weekStart + 'T00:00:00')
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}

/** 0 = Monday ... 6 = Sunday for an ISO date. */
export function weekdayIndex(iso: string): number {
  return (new Date(iso + 'T00:00:00').getDay() + 6) % 7
}

/** ISO date of the first day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(1)
  return toISODate(d)
}

/** Shift by whole months, pinned to the 1st so day-of-month never overflows. */
export function addMonths(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  return toISODate(d)
}

/** Human label like "June 2026". */
export function monthLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

/** Whether an ISO date is in the same calendar month as `anchor`. */
export function isSameMonth(iso: string, anchor: string): boolean {
  return iso.slice(0, 7) === anchor.slice(0, 7)
}

/** The 42 days (six Monday-start weeks) covering the month that contains `iso`. */
export function monthGridDays(iso: string): string[] {
  const start = mondayOf(new Date(startOfMonth(iso) + 'T00:00:00'))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** "08:30" <-> minutes from midnight. */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
