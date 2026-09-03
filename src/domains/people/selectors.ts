/**
 * Ways for a screen to ask for part of the people list.
 *
 * These are for call sites to pass into `usePeople`, so a screen re-renders
 * only when the part it asked for changes. Nothing in this folder uses them.
 *
 * Two shapes. The plain ones take the list and are safe to pass straight in.
 * The ones ending in `For` need an argument first and build a function, so hold
 * the result steady with `useMemo` — a fresh function every render means the
 * work is redone every render.
 *
 * The last two take more than the people list and cannot be passed to
 * `usePeople` at all. Call them directly with what they ask for.
 */
import { type ColorKey, DEFAULT_COLOR, colorKey } from '../../assets/palette'
import type { Person, PersonId } from './types'

/** Everyone, by id — for screens that look people up rather than list them. */
export function byId(people: Person[]): Record<PersonId, Person> {
  const out: Record<PersonId, Person> = {}
  for (const p of people) out[p.id] = p
  return out
}

/** One person, or undefined if they are not in the account. */
export function personFor(id: PersonId) {
  return (people: Person[]): Person | undefined => people.find((p) => p.id === id)
}

/** A short label: "Cris + Nora", or just "Anna". */
export function attendeeLabelFor(attendees: PersonId[]) {
  return (people: Person[]): string => {
    const named = byId(people)
    return attendees.map((id) => named[id]?.name ?? '?').join(' + ')
  }
}

/** Who a new event starts with: the first person in lane order. */
export function defaultAttendees(people: Person[]): PersonId[] {
  return people[0] ? [people[0].id] : []
}

/**
 * The colour a person shows in, given this user's overrides.
 *
 * Takes both, so it is not a `usePeople` selector — read the people and the
 * settings, then call this. An override wins over the shared colour, and
 * anything unrecognised falls back to the default: colours were once stored as
 * raw hex, and one of those left over must not render as a missing colour.
 */
export function personColorKey(
  people: Person[],
  overrides: Record<PersonId, ColorKey>,
  id: PersonId,
): ColorKey {
  const override = overrides[id]
  if (override) return colorKey(override)
  return colorKey(people.find((p) => p.id === id)?.color)
}

/**
 * The colour an event shows in: its own if it has one, otherwise the person's
 * whose lane it is in. Matches how a shared calendar reads — an event with no
 * colour of its own belongs to whoever it is under.
 */
export function eventColorKey(
  people: Person[],
  overrides: Record<PersonId, ColorKey>,
  personId: PersonId | undefined,
  eventColor: ColorKey | undefined,
): ColorKey {
  if (eventColor) return colorKey(eventColor)
  return personId ? personColorKey(people, overrides, personId) : DEFAULT_COLOR
}
