/**
 * What the cached people list looks like the moment an edit is made, before the
 * server has confirmed it.
 *
 * Pure and separate from the mutations so they can be tested without a database
 * or a cache: these are the rules the screen shows instantly, and getting one
 * wrong shows the wrong thing.
 */
import type { Person, PersonId } from './types'

/** The list with one person renamed. Unknown ids leave it untouched. */
export function patchRename(people: Person[], id: PersonId, name: string): Person[] {
  return people.map((p) => (p.id === id ? { ...p, name } : p))
}

/**
 * The list with one person's shared colour changed — the one everyone in the
 * account sees, not this user's own override.
 */
export function patchRecolor(people: Person[], id: PersonId, color: string): Person[] {
  return people.map((p) => (p.id === id ? { ...p, color } : p))
}
