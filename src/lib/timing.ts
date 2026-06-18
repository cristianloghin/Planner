import type { CalendarEvent } from '../types'

export const MINS_PER_DAY = 24 * 60

/** ISO date (yyyy-mm-dd) the event's first occurrence starts on. */
export function eventDate(e: CalendarEvent): string {
  return e.start.slice(0, 10)
}

/** Minutes from midnight the event starts at (0 for all-day). */
export function eventStartMinutes(e: CalendarEvent): number {
  if (e.allDay) return 0
  const [h, m] = e.start.slice(11).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Whole days a single occurrence covers (>= 1) — including timed events past midnight. */
export function eventSpanDays(e: CalendarEvent): number {
  if (e.allDay) return Math.max(1, e.duration)
  const total = eventStartMinutes(e) + Math.max(0, e.duration)
  return Math.max(1, Math.floor((Math.max(1, total) - 1) / MINS_PER_DAY) + 1)
}

/**
 * Minute range [start, end) a *timed* occurrence covers on the day at `offset`
 * within its span — clamped to the day so multi-day blocks render as segments.
 */
export function timedSegment(
  e: CalendarEvent,
  offset: number,
  span: number,
): { start: number; end: number } {
  const s0 = eventStartMinutes(e)
  const end0 = s0 + Math.max(0, e.duration)
  return {
    start: offset === 0 ? s0 : 0,
    end: offset === span - 1 ? end0 - offset * MINS_PER_DAY : MINS_PER_DAY,
  }
}
