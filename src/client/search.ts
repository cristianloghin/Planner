/**
 * Account-scoped full-text search over events.
 *
 * A `SECURITY INVOKER` RPC (migration `0014`, recreated in `0017`), so RLS
 * scopes the results to the caller. `accountId` is still passed explicitly:
 * a user may belong to more than one account, and RLS alone would return the
 * union of all of them.
 *
 * These search the *server*, not in-memory state. That is the point — search
 * keeps working once reads become windowed and the app no longer holds the
 * whole dataset.
 */
import { supabase } from './supabase'

/** One matching event series. */
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

/**
 * Events matching `query`, best first.
 *
 * An empty or whitespace-only query short-circuits to `[]` rather than hitting
 * the server — `websearch_to_tsquery('')` matches nothing, so the round trip
 * would only ever return an empty array.
 *
 * The RPC also selects a `rank` column which is deliberately dropped: it orders
 * the rows server-side (`order by rank desc, dtstart desc nulls last`), so the
 * array order already carries it and callers have no use for the raw score.
 */
export async function searchEvents(accountId: string, query: string): Promise<EventSearchResult[]> {
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
