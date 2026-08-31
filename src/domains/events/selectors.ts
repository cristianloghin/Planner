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
import type { PersonId } from '../people/types'
import type { CalendarEvent, EventTemplate } from './types'

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

/** The events that repeat, which are the only ones that can be split. */
export function repeating(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.recurrence != null)
}

/** One blueprint, or undefined if it has been deleted. */
export function templateFor(id: string) {
  return (templates: EventTemplate[]): EventTemplate | undefined =>
    templates.find((t) => t.id === id)
}
