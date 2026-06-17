import type { CalendarEvent, Reminder } from '../types'
import { addDays, diffDays, toISODate } from './dates'
import { startsOn } from './recurrence'

/** Reminder offsets (minutes before start) offered in the event editor. */
export const REMINDER_OFFSETS = [0, 15, 30, 60, 120, 1440]

export function offsetLabel(min: number): string {
  if (min === 0) return 'At start'
  if (min < 60) return `${min} min before`
  if (min < 1440) {
    const h = min / 60
    return `${h} hour${h > 1 ? 's' : ''} before`
  }
  const d = min / 1440
  return `${d} day${d > 1 ? 's' : ''} before`
}

/** Standalone reminders that apply to ISO `date` (for the Day view list). */
export function remindersOnDate(reminders: Reminder[], date: string): Reminder[] {
  return reminders
    .filter((r) => (r.repeat === 'daily' ? date >= r.date : r.date === date))
    .sort((a, b) => a.time - b.time)
}

/** Local epoch ms for ISO `date` at `minutes` past midnight. */
function atMs(date: string, minutes: number): number {
  const d = new Date(date + 'T00:00:00')
  d.setMinutes(d.getMinutes() + minutes)
  return d.getTime()
}

/** Inclusive list of ISO dates spanning two epoch instants. */
function datesBetween(fromMs: number, toMs: number): string[] {
  const a = toISODate(new Date(fromMs))
  const b = toISODate(new Date(toMs))
  const n = Math.max(0, diffDays(b, a))
  return Array.from({ length: n + 1 }, (_, i) => addDays(a, i))
}

/** A notification that has come due and should be shown in-app. */
export interface FiredAlert {
  id: string
  title: string
  sub?: string
  whenMs: number
}

/**
 * Notifications whose fire time falls in the window (fromMs, toMs]: standalone
 * reminders plus event-attached offsets, expanded across recurrences.
 */
export function dueAlerts(
  events: CalendarEvent[],
  reminders: Reminder[],
  fromMs: number,
  toMs: number,
): FiredAlert[] {
  const out: FiredAlert[] = []
  const inWindow = (w: number) => w > fromMs && w <= toMs

  for (const r of reminders) {
    const days = r.repeat === 'daily' ? datesBetween(fromMs, toMs) : [r.date]
    for (const d of days) {
      if (d < r.date) continue
      const w = atMs(d, r.time)
      if (inWindow(w)) out.push({ id: `r:${r.id}:${w}`, title: r.title, whenMs: w })
    }
  }

  // Event offsets fire before the start, so look ahead by the largest offset.
  const maxOffset = events.reduce(
    (m, e) => Math.max(m, ...(e.reminders ?? [0])),
    0,
  )
  const dates = datesBetween(fromMs, toMs + maxOffset * 60_000)
  for (const e of events) {
    if (!e.reminders?.length) continue
    for (const d of dates) {
      if (!startsOn(e, d)) continue
      const startMs = atMs(d, e.allDay ? 0 : e.start)
      for (const offset of e.reminders) {
        const w = startMs - offset * 60_000
        if (inWindow(w)) {
          out.push({
            id: `e:${e.id}:${offset}:${w}`,
            title: e.title,
            sub: offset === 0 ? 'Starting now' : offsetLabel(offset),
            whenMs: w,
          })
        }
      }
    }
  }

  return out.sort((a, b) => a.whenMs - b.whenMs)
}
