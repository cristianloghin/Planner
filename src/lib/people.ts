import type { AppState, PersonId } from '../types'

/** Colour for shared parent ('Both') events — the `--shared` design token. */
export const SHARED_COLOR = 'var(--shared)'

export const PARENT_IDS: PersonId[] = ['me', 'partner']

export function involvesKid(attendees: PersonId[]): boolean {
  return attendees.includes('kid')
}

/** Exactly the two parents together (the classic 'Both' block). */
export function isParentsPair(attendees: PersonId[]): boolean {
  return attendees.length === 2 && attendees.includes('me') && attendees.includes('partner')
}

/**
 * The colour for an event block. Joint events with Nora borrow her colour so
 * "Nora time" is obvious; a parents-only pair uses the shared accent; otherwise
 * the single person's colour.
 */
export function eventColor(state: AppState, attendees: PersonId[]): string {
  if (involvesKid(attendees)) return state.people.kid.color
  if (isParentsPair(attendees)) return SHARED_COLOR
  return state.people[attendees[0]].color
}

/** Gradient blending the two parents — used for the spanning 'Both' block. */
export function parentsGradient(state: AppState): string {
  return `linear-gradient(120deg, ${state.people.me.color}, ${state.people.partner.color})`
}

/** Short label like "Both", "Cris + Nora", or just "Anna". */
export function attendeeLabel(state: AppState, attendees: PersonId[]): string {
  if (isParentsPair(attendees)) return 'Both'
  return attendees.map((id) => state.people[id].name).join(' + ')
}
