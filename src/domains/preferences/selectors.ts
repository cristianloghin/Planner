/**
 * Ways for a screen to ask for one setting.
 *
 * Each applies the default for a setting that has never been touched, so no
 * screen has to remember what "unset" means.
 */
import type { ColorKey } from '../../assets/palette'
import type { PersonId } from '../people/types'
import type { Preferences, WeekLayout } from './types'

/** How the Week tab lays out the seven days. Unset means stacked day cards. */
export function weekLayout(prefs: Preferences): WeekLayout {
  return prefs.weekLayout ?? 'list'
}

/** This user's own colour for each person. Empty when they have changed none. */
export function personColors(prefs: Preferences): Record<PersonId, ColorKey> {
  return prefs.personColors
}

/**
 * The timezone reminders are timed against. Unset means UTC — which is what the
 * sender assumes, not a guess made here.
 */
export function timezone(prefs: Preferences): string | undefined {
  return prefs.timezone
}
