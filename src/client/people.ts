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

export interface Person {
  id: PersonId
  name: string
  /**
   * The colour everyone in the account sees for this person, as a palette key.
   * A single user can override it for themselves — see `Preferences.personColors`
   * in ./preferences.
   */
  color: string
  /** Lane order, ascending. */
  sortOrder: number
}

/**
 * Everyone in the account, in lane order.
 *
 * Returned as a list, in the order the database gave. Looking people up by id
 * is a different shape for a different purpose, and belongs to whoever needs it
 * (see `byId` in domains/people/selectors).
 */
export async function fetchPeople(accountId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('person')
    .select('id, name, color_key, sort_order')
    .eq('account_id', accountId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color_key,
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
  const { error } = await supabase.from('person').update({ color_key: color }).eq('id', id)
  if (error) throw error
}
