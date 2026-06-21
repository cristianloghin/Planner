import type { AppState, CalendarEvent, Person, PersonId } from '../types'
import { DEFAULT_USER_COLOR, USER_COLORS, eventColorCss, hsl, userColorKey, type UserColorKey } from './palette'

/** Everyone, in lane order. */
export function peopleList(state: AppState): Person[] {
  return Object.values(state.people).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * The user color *key* a person resolves to: this user's personal override if
 * set, else the shared `Person.color`, else the default. Both stored values are
 * palette keys; legacy/unknown values fall back to the default.
 */
export function personColorKey(state: AppState, id: PersonId): UserColorKey {
  const pref = state.preferences.personColors[id]
  if (pref) return userColorKey(pref)
  return userColorKey(state.people[id]?.color)
}

/**
 * The CSS colour to draw a person's lane in — the `main` shade of their resolved
 * user color. Every colour read should go through here so overrides apply
 * everywhere uniformly.
 */
export function personColor(state: AppState, id: PersonId): string {
  return hsl(USER_COLORS[personColorKey(state, id)].main)
}

/** The person whose login is this app_user, if any. */
export function personByUserId(state: AppState, userId: string | undefined): Person | undefined {
  if (!userId) return undefined
  return peopleList(state).find((p) => p.userId === userId)
}

/**
 * The user-color key that drives an event block's background: the creator's, via
 * `createdBy` -> person. Falls back to the first attendee (then the default) when
 * the creator can't be resolved (e.g. an optimistic, not-yet-loaded event).
 */
export function eventOwnerColorKey(state: AppState, ev: CalendarEvent): UserColorKey {
  const owner = personByUserId(state, ev.createdBy)
  if (owner) return personColorKey(state, owner.id)
  return ev.attendees[0] ? personColorKey(state, ev.attendees[0]) : DEFAULT_USER_COLOR
}

/** The creator's `main` shade — for compact spots that want a single color (e.g.
 *  month dots) rather than the full background treatment. */
export function eventMainColor(state: AppState, ev: CalendarEvent): string {
  return hsl(USER_COLORS[eventOwnerColorKey(state, ev)].main)
}

/**
 * The colors that paint an event block: the creator's two background shades plus
 * the left-border color (the event's palette color, defaulting to the creator's
 * main). Shared by the day timeline and the week agenda.
 */
export function eventBlockColors(
  state: AppState,
  ev: CalendarEvent,
): { lightBg: string; darkBg: string; border: string } {
  const c = USER_COLORS[eventOwnerColorKey(state, ev)]
  return {
    lightBg: hsl(c.lightBg),
    darkBg: hsl(c.darkBg),
    border: eventColorCss(ev.colorKey) ?? hsl(c.main),
  }
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
