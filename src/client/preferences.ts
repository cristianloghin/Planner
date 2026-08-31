/**
 * Per-user settings (`user_preference`).
 *
 * Personal, never shared: one row per (account, user), so partners in the same
 * account keep their own colours and layout. The settings live in a single JSON
 * column, which is why adding a setting is just a new field here and no
 * migration.
 */
import { type ColorKey, isColorKey } from '../lib/palette'
import type { Json } from './database.types'
import type { PersonId } from './people'
import { supabase } from './supabase'

/** How the Week tab lays out the seven days. */
export type WeekLayout = 'list' | 'timeline'

/**
 * One user's settings for one account.
 *
 * @see fetchPreferences for what an absent or unreadable row falls back to.
 */
export interface Preferences {
  /**
   * How this user sees each person's colour, keyed by person id. An override
   * on top of the shared `Person.color`; a person with no entry falls back to
   * it.
   */
  personColors: Record<PersonId, ColorKey>
  /**
   * The user's device timezone, stamped on startup. The reminder sender
   * (`supabase/functions/send-reminders`) works out their wall-clock fire times
   * from it; absent means UTC.
   */
  timezone?: string
  /** Week tab layout; absent means `list`. */
  weekLayout?: WeekLayout
}

/** What a user with no settings row gets. */
const defaults: Preferences = { personColors: {} }

/**
 * This user's settings for this account.
 *
 * Never throws. Settings are decoration — a colour override, a layout choice —
 * so a read that fails logs and returns defaults rather than taking the whole
 * startup down with it. This is deliberate: the app once shipped ahead of the
 * migration that created this table, and defaults kept it running.
 *
 * Colour overrides are filtered to keys the palette actually has. Older rows
 * hold raw hex values from before the palette was unified (migration `0015`);
 * dropping them lets that person fall back to their shared colour instead of
 * rendering an unknown colour.
 */
export async function fetchPreferences(accountId: string, userId: string): Promise<Preferences> {
  const { data, error } = await supabase
    .from('user_preference')
    .select('prefs')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('Could not load preferences; using defaults.', error)
    return defaults
  }
  const prefs = (data?.prefs ?? {}) as Partial<Preferences>
  const personColors: Preferences['personColors'] = {}
  for (const [id, key] of Object.entries(prefs.personColors ?? {})) {
    if (isColorKey(key)) personColors[id] = key
  }
  return { ...defaults, ...prefs, personColors }
}

/**
 * Save this user's settings for this account.
 *
 * Writes the whole document, so the caller passes the complete settings it
 * wants stored, not just the field that changed. Changing one setting from two
 * devices at once means the last write wins for all of them.
 */
export async function savePreferences(
  accountId: string,
  userId: string,
  prefs: Preferences,
): Promise<void> {
  const { error } = await supabase.from('user_preference').upsert(
    {
      account_id: accountId,
      user_id: userId,
      // Preferences is a structured interface; the column is free-form Json.
      prefs: prefs as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,user_id' },
  )
  if (error) throw error
}
