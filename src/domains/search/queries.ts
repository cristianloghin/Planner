/**
 * Searching events.
 *
 * The search runs on the server, so it keeps working however little of the
 * account is loaded. Results are cached per search term, which means going back
 * to a term you just typed is instant and typing a character and deleting it
 * again costs nothing.
 *
 * **Pass a settled search term.** These fire as the term changes, so a term
 * taken straight from a keystroke means a request per keystroke. Wait for a
 * pause in typing before passing it in.
 */
import { useQuery } from '@tanstack/react-query'
import { searchEvents } from '../../client/search'
import type { EventSearchResult } from './types'

export const eventSearchKey = (accountId: string | null, query: string) =>
  ['search', 'events', accountId, query] as const

// Long enough that repeating a search is instant, short enough that something
// added a moment ago turns up.
const STALE_MS = 30_000

/**
 * Events matching `query`, best first.
 *
 * An empty term searches nothing at all — no request, no empty result cached.
 */
export function useEventSearch<T = EventSearchResult[]>(
  accountId: string | null,
  query: string,
  select?: (results: EventSearchResult[]) => T,
) {
  // Trimmed so trailing spaces are not a different search.
  const q = query.trim()
  return useQuery({
    queryKey: eventSearchKey(accountId, q),
    queryFn: () => searchEvents(accountId as string, q),
    enabled: accountId != null && q.length > 0,
    staleTime: STALE_MS,
    select,
  })
}
