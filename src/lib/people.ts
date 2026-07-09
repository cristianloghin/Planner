import type { AppState, CalendarEvent, Person, PersonId } from '../types'
import { type ColorKey, DEFAULT_COLOR, colorKey } from './palette'

/** Everyone, in lane order. */
export function peopleList(state: AppState): Person[] {
  return Object.values(state.people).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * The palette *key* a person resolves to: this user's personal override if set,
 * else the shared `Person.color`, else the default. Stored values are palette
 * keys; legacy/unknown values fall back to the default.
 */
export function personColorKey(state: AppState, id: PersonId): ColorKey {
  const pref = state.preferences.personColors[id]
  if (pref) return colorKey(pref)
  return colorKey(state.people[id]?.color)
}

/**
 * The palette key an event renders in: its own color if set, otherwise inherited
 * from the given person (its lane person on the timeline, or first attendee in
 * list/dot views) — Google-Calendar style.
 */
export function eventColorKey(
  state: AppState,
  personId: PersonId | undefined,
  ev: CalendarEvent,
): ColorKey {
  if (ev.colorKey) return colorKey(ev.colorKey)
  return personId ? personColorKey(state, personId) : DEFAULT_COLOR
}

export function adults(state: AppState): Person[] {
  return peopleList(state).filter((p) => p.kind === 'adult')
}

export function children(state: AppState): Person[] {
  return peopleList(state).filter((p) => p.kind === 'child')
}

/** Any child on this roster. */
export function involvesChild(state: AppState, attendees: PersonId[]): boolean {
  return attendees.some((id) => state.people[id]?.kind === 'child')
}

/**
 * Exactly all the adults together (and at least two of them) — the merged
 * "Both"/"Everyone" block that spans the adult lanes. Generalizes the old
 * two-parent pair to any number of adults.
 */
export function isAllAdults(state: AppState, attendees: PersonId[]): boolean {
  const adultIds = adults(state).map((p) => p.id)
  if (adultIds.length < 2 || attendees.length !== adultIds.length) return false
  const set = new Set(attendees)
  return adultIds.every((id) => set.has(id))
}

/** Short label like "Both", "Everyone", "Cris + Nora", or just "Anna". */
export function attendeeLabel(state: AppState, attendees: PersonId[]): string {
  if (isAllAdults(state, attendees)) return adults(state).length === 2 ? 'Both' : 'Everyone'
  return attendees.map((id) => state.people[id]?.name ?? '?').join(' + ')
}

/** Default roster for a new event: the first adult, or the first person. */
export function defaultAttendees(state: AppState): PersonId[] {
  const first = adults(state)[0] ?? peopleList(state)[0]
  return first ? [first.id] : []
}
