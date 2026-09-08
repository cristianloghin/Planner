/**
 * What the cached people list looks like the moment an edit is made, before the
 * server has confirmed it.
 *
 * Pure and separate from the mutations so they can be tested without a database
 * or a cache: these are the rules the screen shows instantly, and getting one
 * wrong shows the wrong thing.
 */
import type { ColorKey } from '../../assets/palette'
import type { Person, PersonId, Preferences } from './types'

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

/*
 * This user's settings are stored as one document and saved whole, so changing
 * one thing means producing the whole thing with that one change made. These
 * are for the *call site*: it builds the next document and hands it to the
 * write, which keeps the write self-sufficient — the values it carries are the
 * document to save, so a write resumed after a restart has everything it needs.
 */

/** With this user's own colour set for one person. */
export function withPersonColor(prefs: Preferences, id: PersonId, color: ColorKey): Preferences {
  return { ...prefs, personColors: { ...prefs.personColors, [id]: color } }
}

/** With this user's own colour for one person removed, so they fall back to the shared one. */
export function withoutPersonColor(prefs: Preferences, id: PersonId): Preferences {
  const { [id]: _removed, ...rest } = prefs.personColors
  return { ...prefs, personColors: rest }
}

/** With the device timezone recorded, which is what reminders are timed against. */
export function withTimezone(prefs: Preferences, timezone: string): Preferences {
  return { ...prefs, timezone }
}
