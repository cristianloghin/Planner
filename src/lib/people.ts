import type { AppState, CalendarEvent, Person, PersonId } from '../types'
import { DEFAULT_USER_COLOR, USER_COLORS, hsl, userColorKey, type UserColorKey } from './palette'

/** Colour for an all-adults ('Both'/'Everyone') event — the `--shared` token. */
export const SHARED_COLOR = 'var(--shared)'

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

/**
 * The colour for an event block. An event involving a child borrows the child's
 * colour so "kid time" stands out; an all-adults event uses the shared accent;
 * otherwise the first person's colour.
 */
export function eventColor(state: AppState, attendees: PersonId[]): string {
  const childId = attendees.find((id) => state.people[id]?.kind === 'child')
  if (childId) return personColor(state, childId)
  if (isAllAdults(state, attendees)) return SHARED_COLOR
  return attendees[0] ? personColor(state, attendees[0]) : SHARED_COLOR
}

/** Gradient blending the adult colours — used for the spanning all-adults block. */
export function adultsGradient(state: AppState): string {
  const cols = adults(state).map((p) => personColor(state, p.id))
  if (cols.length === 0) return SHARED_COLOR
  if (cols.length === 1) return cols[0]
  return `linear-gradient(120deg, ${cols.join(', ')})`
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
