import { offsetLabel } from '../../assets/utils/dates'
import { addDays, diffDays, toISODate } from '../../assets/utils/dates'
/**
 * Which reminders have come due.
 *
 * Fed the events and their per-day state; works out which of their attached
 * reminders fall in a window of time. Knows nothing about how they are shown or
 * where the events came from.
 */
import type { CalendarEvent } from '../../domains/events/types'
import type { OccurrenceIndex } from '../../domains/events/types'
import { startsOn } from '../recurrence/expand'
import { eventStartMinutes } from '../recurrence/timing'

/**
 * When an event's reminders fire, in minutes before it starts, soonest last.
 *
 * Inlined rather than taken from the events domain: a service cannot reach into
 * a domain, and this is a one-line read over a shape it was handed.
 */
function reminderOffsets(event: Pick<CalendarEvent, 'reminders'>): number[] {
  return event.reminders.map((a) => a.offset).sort((a, b) => a - b)
}

/** All-day reminders have no clock time, so they anchor to this time of day. */
const ALLDAY_REMINDER_MIN = 9 * 60

/** Local epoch ms for ISO `date` at `minutes` past midnight. */
function atMs(date: string, minutes: number): number {
  const d = new Date(`${date}T00:00:00`)
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
 * How far around the window we scan origin slots for occurrences whose one-off
 * reschedule moved their start into the window from a day outside it.
 */
const RELOCATION_LOOKAROUND_DAYS = 31

/**
 * Event-attached reminders whose fire time falls in the window (fromMs, toMs],
 * expanded across recurrences. Standalone reminders no longer exist — every
 * reminder is an attachment on an event (a point-in-time event for a bare ping).
 * Per-occurrence state applies: a cancelled occurrence fires nothing, and a
 * rescheduled one fires relative to its overridden start.
 */
export function dueAlerts(
  events: CalendarEvent[],
  occurrences: OccurrenceIndex,
  fromMs: number,
  toMs: number,
): FiredAlert[] {
  const out: FiredAlert[] = []
  const inWindow = (w: number) => w > fromMs && w <= toMs

  // Reminders fire before the start, so look ahead by the largest offset; look
  // around both ends so a rescheduled occurrence's origin slot is still scanned.
  const maxOffset = events.reduce((m, e) => Math.max(m, ...reminderOffsets(e), 0), 0)
  const lookaround = RELOCATION_LOOKAROUND_DAYS * 24 * 60 * 60_000
  const dates = datesBetween(fromMs - lookaround, toMs + maxOffset * 60_000 + lookaround)

  for (const e of events) {
    const offsets = reminderOffsets(e)
    if (!offsets.length) continue
    const baseMin = e.allDay ? ALLDAY_REMINDER_MIN : eventStartMinutes(e)
    for (const d of dates) {
      if (!startsOn(e, d)) continue
      const ov = occurrences.on(e.id, d)
      if (ov?.cancelled) continue
      // A timing override moves the anchor: `start` is a full datetime (timed)
      // or a date (all-day, which keeps the fixed reminder time of day).
      const startMs = ov?.start
        ? e.allDay
          ? atMs(ov.start.slice(0, 10), ALLDAY_REMINDER_MIN)
          : new Date(ov.start).getTime()
        : atMs(d, baseMin)
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
