/**
 * Turning a stored series into an event or a blueprint, and back.
 *
 * Used only inside this domain. Reminders carry straight through — the stored
 * shape and the app's are the same `{ id, offset }` — so this is now just the
 * event/blueprint split and the missing-date rule.
 */
import { DEFAULT_COLOR } from '../../assets/palette'
import { toISODate } from '../../assets/utils/dates'
import { uid } from '../../assets/utils/id'
import type { OccurrenceRow } from '../../client/occurrences'
import type { Series } from '../../client/series'
import type {
  CalendarEvent,
  EventReminder,
  EventTemplate,
  OccurrenceIndex,
  OccurrenceMap,
  OccurrenceState,
} from './types'

/**
 * Reminders copied with **fresh ids**, for the template ↔ event copy paths: the
 * copy owns brand-new `reminder` rows rather than aliasing the source's.
 */
export function cloneReminders(reminders: EventReminder[]): EventReminder[] {
  return reminders.map((r) => ({ ...r, id: uid() }))
}

/**
 * A stored series read as an event.
 *
 * A series with no start becomes one starting today. An event has to be
 * somewhere on the calendar to be drawn at all, and today is where a person
 * would look for it — that is the app's answer to a missing date, not the
 * database's, which is why it is here.
 */
export function toEvent(series: Series): CalendarEvent {
  return {
    id: series.id,
    title: series.title,
    start: series.start ?? toISODate(new Date()),
    allDay: series.allDay,
    duration: series.duration,
    recurrence: series.recurrence,
    attendees: series.attendees,
    colorKey: series.colorKey,
    reminders: series.reminders,
  }
}

/**
 * A stored series read as a blueprint: everything but the timing and the
 * people. A row saved before templates had a colour of their own has none
 * stored; it reads as the default rather than as a missing colour.
 */
export function toTemplate(series: Series): EventTemplate {
  return {
    id: series.id,
    title: series.title,
    allDay: series.allDay,
    duration: series.duration,
    colorKey: series.colorKey ?? DEFAULT_COLOR,
    reminders: series.reminders,
  }
}

/** An event as the series to store. */
export function fromEvent(event: CalendarEvent): Series {
  return {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    start: event.start,
    duration: event.duration,
    recurrence: event.recurrence,
    attendees: event.attendees,
    colorKey: event.colorKey,
    reminders: event.reminders,
    isTemplate: false,
  }
}

/**
 * A blueprint as the series to store: no start, no repeat and nobody on it,
 * which is exactly what makes it a blueprint rather than an event.
 */
export function fromTemplate(template: EventTemplate): Series {
  return {
    id: template.id,
    title: template.title,
    allDay: template.allDay,
    start: null,
    duration: template.duration,
    recurrence: undefined,
    attendees: [],
    colorKey: template.colorKey,
    reminders: template.reminders,
    isTemplate: true,
  }
}

// ---- what happened on a day ----

/** The key one day of one event is found under. This domain's own; see `OccurrenceIndex`. */
export const occurrenceKey = (eventId: string, date: string): string => `${eventId}:${date}`

/**
 * Every day with something recorded.
 *
 * A row that carries nothing the app shows is left out entirely — clearing a
 * timing override leaves an empty row behind, and an entry for it would read as
 * "something happened here" on a day where nothing did.
 *
 * Two rows can land on the same day. A day's row is stored at the time of day
 * the series had when it was written, so a row written before a time edit sits
 * at the old time while later ones sit at the new one — and the key here is the
 * day alone. Writes avoid making a second row (see `dayRange` in
 * client/occurrences), but a pair written before that rule existed still reads
 * back as two. They are layered rather than replaced, so a day that was
 * cancelled by one row and moved by another keeps both.
 */
export function toOccurrences(rows: OccurrenceRow[]): OccurrenceMap {
  const out: OccurrenceMap = {}

  for (const o of rows) {
    const key = occurrenceKey(o.seriesId, o.date)
    const entry: OccurrenceState = { ...out[key] }
    if (o.cancelled) entry.cancelled = true
    if (o.start != null) entry.start = o.start
    if (o.duration != null) entry.duration = o.duration
    if (o.attendees != null) entry.attendees = o.attendees
    if (Object.keys(entry).length) out[key] = entry
  }

  return out
}

/** The map as lookups, so nothing outside this domain needs its key format. */
export function indexOccurrences(map: OccurrenceMap): OccurrenceIndex {
  const byEvent = new Map<string, [string, OccurrenceState][]>()
  for (const [key, state] of Object.entries(map)) {
    const sep = key.indexOf(':')
    if (sep < 0) continue
    const id = key.slice(0, sep)
    let days = byEvent.get(id)
    if (!days) {
      days = []
      byEvent.set(id, days)
    }
    days.push([key.slice(sep + 1), state])
  }
  const none: [string, OccurrenceState][] = []
  return {
    on: (eventId, date) => map[occurrenceKey(eventId, date)],
    of: (eventId) => byEvent.get(eventId) ?? none,
  }
}
