/**
 * Ways for a screen to ask for part of the events.
 *
 * For call sites to pass into `useEvents` or `useTemplates`. The ones ending in
 * `For` need an argument first and build a function, so hold the result with
 * `useMemo`.
 *
 * Which DAYS an event lands on is not here. That is worked out from its repeat
 * rule, which is a job of its own — feed these events to it.
 */
import type { SeriesTiming } from '../../client/series'
import type { PersonId } from '../people/types'
import type { CalendarEvent, EventTemplate } from './types'

// Anything carrying reminders (a CalendarEvent or an EventTemplate).
type WithReminders = { reminders: { offset: number }[] }

/** Reminder offsets (minutes before start), ascending. */
export function reminderOffsets(e: WithReminders): number[] {
  return e.reminders.map((r) => r.offset).sort((a, b) => a - b)
}

export function hasReminders(e: WithReminders): boolean {
  return e.reminders.length > 0
}

/**
 * The little of an event a write about one of its days needs: which series, and
 * where its days sit in time.
 *
 * Writes that name a day carry this rather than the whole event. A set of
 * values that has to survive a restart should be as small as it can be, and
 * this is all the write needs to find the row.
 */
export function timingOf(event: CalendarEvent): SeriesTiming {
  return { id: event.id, allDay: event.allDay, start: event.start }
}

/** One event, or undefined if it has been deleted. */
export function eventFor(id: string) {
  return (events: CalendarEvent[]): CalendarEvent | undefined => events.find((e) => e.id === id)
}

/** Every event, by id — for screens that look events up rather than list them. */
export function byId(events: CalendarEvent[]): Record<string, CalendarEvent> {
  const out: Record<string, CalendarEvent> = {}
  for (const e of events) out[e.id] = e
  return out
}

/** The events one person is on — their lane. */
export function forAttendeeFor(personId: PersonId) {
  return (events: CalendarEvent[]): CalendarEvent[] =>
    events.filter((e) => e.attendees.includes(personId))
}

/** One blueprint, or undefined if it has been deleted. */
export function templateFor(id: string) {
  return (templates: EventTemplate[]): EventTemplate | undefined =>
    templates.find((t) => t.id === id)
}
