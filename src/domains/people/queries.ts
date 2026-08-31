/**
 * Reading the people in an account.
 *
 * One query holding the whole list — there are only ever a handful, and every
 * screen wants a different cut of them. Callers narrow it by passing a selector
 * from ./selectors, which keeps each screen re-rendering only when the part it
 * asked for changes.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchPeople } from '../../client/people'
import type { Person } from './types'

/** Everything cached under this domain, for invalidating the lot. */
export const peopleKey = (accountId: string | null) => ['people', accountId] as const

// People change rarely, and a change arrives over the realtime channel anyway,
// so there is nothing to gain from refetching on every mount and focus.
const STALE_MS = 5 * 60_000

/**
 * Everyone in the account, in lane order.
 *
 * Pass a selector from ./selectors to get a narrower shape — `byId` for a
 * lookup, `adults` for one kind, and so on. Anything built at the call site
 * (`personById(id)`) has to be held steady with `useMemo`, or it counts as a
 * new selector on every render and the work is redone each time.
 *
 * Waits until there is an account to read.
 */
export function usePeople<T = Person[]>(
  accountId: string | null,
  select?: (people: Person[]) => T,
) {
  return useQuery({
    queryKey: peopleKey(accountId),
    queryFn: () => fetchPeople(accountId as string),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}
