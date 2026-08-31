/**
 * Building the next settings document.
 *
 * Settings are stored as one document and saved whole, so changing one thing
 * means producing the whole thing with that one change made. These do that, and
 * because they are pure they are also exactly what the optimistic update shows.
 *
 * Unlike other domains' patches, these are for the *call site*: it builds the
 * next document and hands it to the write. That is what keeps the write itself
 * self-sufficient — the values it carries are the document to save, so a write
 * resumed after a restart has everything it needs.
 */
import type { ColorKey } from '../../assets/palette'
import type { PersonId } from '../people/types'
import type { Preferences, WeekLayout } from './types'

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

/** With the Week tab layout chosen. */
export function withWeekLayout(prefs: Preferences, weekLayout: WeekLayout): Preferences {
  return { ...prefs, weekLayout }
}
