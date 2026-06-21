import { supabase } from './supabase'

/**
 * Server-side search. These call the account-scoped FTS RPCs (migration 0014)
 * rather than filtering in-memory state, so search keeps working once data
 * loading becomes contextual and the client no longer holds the whole dataset.
 * RLS scopes the results to the caller's account; we still pass `accountId` to
 * narrow to the active one when a user belongs to several.
 */

export interface EventSearchResult {
  seriesId: string
  title: string
  /** Series start (ISO timestamptz), or null on the rare row with no start. */
  dtstart: string | null
  allDay: boolean
  /** RRULE string; non-null means the event repeats. */
  rrule: string | null
  /** A short note excerpt for context, or null when the match was title-only. */
  snippet: string | null
}

export interface ListItemSearchResult {
  itemId: string
  listId: string
  listTitle: string
  title: string
  groupLabel: string | null
  done: boolean
  dueOn: string | null
  personId: string | null
}

export async function searchEvents(
  accountId: string,
  query: string,
): Promise<EventSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_events', {
    p_account: accountId,
    p_query: q,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    seriesId: r.series_id,
    title: r.title,
    dtstart: r.dtstart,
    allDay: r.all_day,
    rrule: r.rrule,
    snippet: r.snippet,
  }))
}

export async function searchListItems(
  accountId: string,
  query: string,
): Promise<ListItemSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_list_items', {
    p_account: accountId,
    p_query: q,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    listId: r.list_id,
    listTitle: r.list_title,
    title: r.title,
    groupLabel: r.group_label,
    done: r.done,
    dueOn: r.due_on,
    personId: r.person_id,
  }))
}
