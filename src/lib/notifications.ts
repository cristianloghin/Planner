import type { CalendarEvent } from '../types'
import { addDays, diffDays, toISODate } from './dates'
import { startsOn } from './recurrence'
import { eventStartMinutes } from './timing'
import { reminderOffsets } from './attachments'

/** Reminder offsets (minutes before start) offered in the event editor. */
export const REMINDER_OFFSETS = [0, 15, 30, 60, 120, 1440]

/** All-day reminders have no clock time, so they anchor to this time of day. */
const ALLDAY_REMINDER_MIN = 9 * 60

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
 * Event-attached reminders whose fire time falls in the window (fromMs, toMs],
 * expanded across recurrences. Standalone reminders no longer exist — every
 * reminder is an attachment on an event (a point-in-time event for a bare ping).
 */
export function dueAlerts(events: CalendarEvent[], fromMs: number, toMs: number): FiredAlert[] {
  const out: FiredAlert[] = []
  const inWindow = (w: number) => w > fromMs && w <= toMs

  // Reminders fire before the start, so look ahead by the largest offset.
  const maxOffset = events.reduce((m, e) => Math.max(m, ...reminderOffsets(e), 0), 0)
  const dates = datesBetween(fromMs, toMs + maxOffset * 60_000)

  for (const e of events) {
    const offsets = reminderOffsets(e)
    if (!offsets.length) continue
    const baseMin = e.allDay ? ALLDAY_REMINDER_MIN : eventStartMinutes(e)
    for (const d of dates) {
      if (!startsOn(e, d)) continue
      const startMs = atMs(d, baseMin)
      for (const offset of offsets) {
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
