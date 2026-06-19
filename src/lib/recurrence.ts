import type { CalendarEvent, Recurrence } from '../types'
import { addDays, diffDays, toISODate } from './dates'
import { eventDate, eventSpanDays, timedSegment } from './timing'

/** Does an occurrence of `e` start exactly on ISO `date`? */
export function startsOn(e: CalendarEvent, date: string): boolean {
  const base = eventDate(e)
  const delta = diffDays(date, base)
  if (delta < 0) return false
  if (delta === 0) return true
  const r = e.recurrence
  if (!r) return false
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return delta % n === 0
    case 'weekly':
      return delta % 7 === 0 && (delta / 7) % n === 0
    case 'monthly': {
      const a = new Date(base + 'T00:00:00')
      const b = new Date(date + 'T00:00:00')
      // Same day-of-month only (months missing that day simply skip).
      if (a.getDate() !== b.getDate()) return false
      const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      return months % n === 0
    }
  }
}

/**
 * The latest occurrence start date of `e` on or before ISO `date`, or null if
 * the first occurrence is still in the future. Used to resolve which occurrence
 * of a prerequisite a given dependent occurrence waits on.
 */
export function latestStartOnOrBefore(e: CalendarEvent, date: string): string | null {
  const base = eventDate(e)
  const delta = diffDays(date, base)
  if (delta < 0) return null
  const r = e.recurrence
  if (!r) return base
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return addDays(base, Math.floor(delta / n) * n)
    case 'weekly':
      return addDays(base, Math.floor(delta / (7 * n)) * 7 * n)
    case 'monthly': {
      const start = new Date(base + 'T00:00:00')
      const target = new Date(date + 'T00:00:00')
      const months =
        (target.getFullYear() - start.getFullYear()) * 12 +
        (target.getMonth() - start.getMonth())
      for (let k = Math.floor(months / n); k >= 0; k--) {
        const d = new Date(start)
        d.setMonth(d.getMonth() + k * n)
        // Skip months that don't have the anchor day-of-month (date overflow).
        if (d.getDate() !== start.getDate()) continue
        const iso = toISODate(d)
        if (diffDays(date, iso) >= 0) return iso
      }
      return null
    }
  }
}

/**
 * Occurrence start dates of `e` within the inclusive ISO range [from, to]. Used
 * to populate the prerequisite-occurrence picker, so the user links to a real
 * RRULE slot (never an arbitrary date). The range is walked day-by-day; callers
 * keep it bounded (a recurring event has no natural end).
 */
export function seriesOccurrenceDatesInRange(e: CalendarEvent, from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; diffDays(to, d) >= 0; d = addDays(d, 1)) {
    if (startsOn(e, d)) out.push(d)
  }
  return out
}

/** One materialised event instance covering a specific date. */
export interface DayOccurrence {
  event: CalendarEvent
  /** ISO date this occurrence's span starts on (its per-occurrence identity). */
  start: string
  /** 0-based index of the queried date within the span. */
  offset: number
  span: number
  isStart: boolean
  isEnd: boolean
  /** Minute range covered on the queried day. All-day events use the full day. */
  segment: { start: number; end: number }
}

/** Occurrences (timed blocks or all-day spans) that cover ISO `date`. */
export function occurrencesOnDate(events: CalendarEvent[], date: string): DayOccurrence[] {
  const out: DayOccurrence[] = []
  for (const event of events) {
    const span = eventSpanDays(event)
    // A span covering `date` may have begun up to span-1 days earlier; the
    // smallest offset is the occurrence we want.
    for (let back = 0; back < span; back++) {
      const start = addDays(date, -back)
      if (startsOn(event, start)) {
        out.push({
          event,
          start,
          offset: back,
          span,
          isStart: back === 0,
          isEnd: back === span - 1,
          segment: event.allDay
            ? { start: 0, end: 24 * 60 }
            : timedSegment(event, back, span),
        })
        break
      }
    }
  }
  return out
}

export function recurrenceLabel(r?: Recurrence): string {
  if (!r) return 'Does not repeat'
  const n = Math.max(1, r.interval)
  const unit = r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : 'month'
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
}
