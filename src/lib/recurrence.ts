import type { CalendarEvent, Recurrence } from '../types'
import { addDays, diffDays } from './dates'

/** Whole days an event covers. Timed events are always single-day. */
export function eventSpan(e: CalendarEvent): number {
  return e.allDay ? Math.max(1, e.days) : 1
}

/** Does an occurrence of `e` start exactly on ISO `date`? */
export function startsOn(e: CalendarEvent, date: string): boolean {
  const delta = diffDays(date, e.date)
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
      const a = new Date(e.date + 'T00:00:00')
      const b = new Date(date + 'T00:00:00')
      // Same day-of-month only (months missing that day simply skip).
      if (a.getDate() !== b.getDate()) return false
      const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      return months % n === 0
    }
  }
}

/** One materialised event instance covering a specific date. */
export interface DayOccurrence {
  event: CalendarEvent
  /** ISO date this occurrence's span starts on. */
  start: string
  /** 0-based index of the queried date within the span. */
  offset: number
  span: number
  isStart: boolean
  isEnd: boolean
}

/** Occurrences (timed blocks or all-day spans) that cover ISO `date`. */
export function occurrencesOnDate(events: CalendarEvent[], date: string): DayOccurrence[] {
  const out: DayOccurrence[] = []
  for (const event of events) {
    const span = eventSpan(event)
    // A span covering `date` may have begun up to span-1 days earlier; the
    // smallest offset is the occurrence we want.
    for (let back = 0; back < span; back++) {
      const start = addDays(date, -back)
      if (startsOn(event, start)) {
        out.push({ event, start, offset: back, span, isStart: back === 0, isEnd: back === span - 1 })
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
