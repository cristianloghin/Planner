/**
 * The people in an account (`person`) — one calendar lane each.
 *
 * A person is not a login. Most are just names on the calendar; one may be
 * linked to a signed-in user, which is how a new account's first person is
 * created (migration `0005`). The app is generic over however many there are.
 */
import type { ColorKey } from '../assets/palette'
import { supabase } from './supabase'

/** A person's id — an opaque string (a database uuid), not a fixed set. */
export type PersonId = string

/**
 * Adults hold a full lane and can supervise; children get a narrow lane and
 * need a free adult on their events.
 */
export type PersonKind = 'adult' | 'child'

export interface Person {
  id: PersonId
  name: string
  /**
   * The colour everyone in the account sees for this person, as a palette key.
   * A single user can override it for themselves — see `Preferences.personColors`
   * in ./preferences.
   */
  color: string
  kind: PersonKind
  /** Lane order, ascending. */
  sortOrder: number
}

/**
 * Everyone in the account, in lane order.
 *
 * `kind` comes back as free text from the database, so anything that isn't
 * exactly `child` is read as an adult — a lane always renders, whatever is in
 * the column.
 *
 * Returned as a list, in the order the database gave. Looking people up by id
 * is a different shape for a different purpose, and belongs to whoever needs it
 * (see `byId` in domains/people/selectors).
 */
export async function fetchPeople(accountId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('person')
    .select('id, name, color, kind, sort_order')
    .eq('account_id', accountId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    kind: p.kind === 'child' ? 'child' : 'adult',
    sortOrder: p.sort_order,
  }))
}

/** Rename a person. Everyone in the account sees the new name. */
export async function renamePerson(id: PersonId, name: string): Promise<void> {
  const { error } = await supabase.from('person').update({ name }).eq('id', id)
  if (error) throw error
}

/**
 * Change a person's shared colour — the one everyone in the account sees.
 *
 * To change it for yourself only, write `personColors` through
 * `savePreferences` in ./preferences instead.
 */
export async function recolorPerson(id: PersonId, color: ColorKey): Promise<void> {
  const { error } = await supabase.from('person').update({ color }).eq('id', id)
  if (error) throw error
}
