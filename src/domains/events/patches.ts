/**
 * What the events look like the moment an edit is made, before the server has
 * confirmed it.
 *
 * Pure, so the rules a screen shows instantly can be tested without a database
 * or a cache.
 */
import type { PersonId } from '../people/types'
import type { CalendarEvent, EventTemplate, OccurrenceMap, OccurrenceState } from './types'

/** With an event added or replaced, whichever it turns out to be. */
export function patchSaveEvent(events: CalendarEvent[], event: CalendarEvent): CalendarEvent[] {
  return events.some((e) => e.id === event.id)
    ? events.map((e) => (e.id === event.id ? event : e))
    : [...events, event]
}

export function patchRemoveEvent(events: CalendarEvent[], id: string): CalendarEvent[] {
  return events.filter((e) => e.id !== id)
}

/** With a blueprint added or replaced. */
export function patchSaveTemplate(
  templates: EventTemplate[],
  template: EventTemplate,
): EventTemplate[] {
  return templates.some((t) => t.id === template.id)
    ? templates.map((t) => (t.id === template.id ? template : t))
    : [...templates, template]
}

export function patchRemoveTemplate(templates: EventTemplate[], id: string): EventTemplate[] {
  return templates.filter((t) => t.id !== id)
}

// ---- what one day looks like the moment something is recorded against it ----
//
// Pure, so the rules a screen shows instantly can be tested without a database
// or a cache. These mirror what the server does, including the part that is
// easy to miss: a day left with nothing recorded has no entry at all, matching
// the read, which leaves such rows out.

/** Every change to one day, as one set of values that can be written down. */
export type OccurrenceChange =
  | { kind: 'override'; start: string; duration: number }
  | { kind: 'clearOverride' }
  | { kind: 'attendees'; attendees: PersonId[] }
  | { kind: 'clearAttendees' }
  | { kind: 'cancel' }

/** The same people, whatever order the chips put them in. */
export function samePeople(a: PersonId[], b: PersonId[]): boolean {
  return a.length === b.length && new Set(a).size === new Set([...a, ...b]).size
}

/**
 * What a day should record for its people: the series' own roster is a CLEAR
 * rather than an override that happens to match, so the day stops carrying an
 * override at all once it is back to normal.
 */
export function rosterChange(next: PersonId[], seriesRoster: PersonId[]): OccurrenceChange {
  return samePeople(next, seriesRoster)
    ? { kind: 'clearAttendees' }
    : { kind: 'attendees', attendees: next }
}

/**
 * One day's state with `change` applied.
 *
 * Clearing a timing override keeps everything else on the day — it may also
 * have been taken out — which is exactly what the write does.
 */
export function patchEntry(
  entry: OccurrenceState | undefined,
  change: OccurrenceChange,
): OccurrenceState {
  switch (change.kind) {
    case 'override':
      return { ...entry, start: change.start, duration: change.duration }
    case 'clearOverride': {
      const { start: _s, duration: _d, ...rest } = entry ?? {}
      return rest
    }
    case 'attendees':
      return { ...entry, attendees: change.attendees }
    case 'clearAttendees': {
      const { attendees: _a, ...rest } = entry ?? {}
      return rest
    }
    case 'cancel':
      return { ...entry, cancelled: true }
  }
}

/**
 * A window of days with `change` applied to one of them.
 *
 * A day patched back to nothing is dropped rather than left as an empty entry,
 * so it reads the same as a day nothing ever happened on.
 */
export function patchOccurrences(
  occurrences: OccurrenceMap,
  key: string,
  change: OccurrenceChange,
): OccurrenceMap {
  const next = { ...occurrences }
  const patched = patchEntry(occurrences[key], change)
  if (Object.keys(patched).length) next[key] = patched
  else delete next[key]
  return next
}
