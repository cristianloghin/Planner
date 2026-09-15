/**
 * Reading the people in an account, and how this user sees them.
 *
 * One query holding the whole list — there are only ever a handful, and every
 * screen wants a different cut of them. Callers narrow it by passing a selector
 * from ./selectors, which keeps each screen re-rendering only when the part it
 * asked for changes.
 *
 * A second query holds this user's own settings for the account, keyed by the
 * user as well — two partners sharing an account each have their own. The two
 * meet in `usePeopleWithColors`, which is what every screen that shows a
 * person actually wants.
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchPeople } from '../../client/people'
import { fetchPreferences } from '../../client/preferences'
import { personColorMap, personColors } from './selectors'
import type { Person, Preferences } from './types'

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

export const preferencesKey = (accountId: string | null, userId: string | null) =>
  ['preferences', accountId, userId] as const

/**
 * This user's settings for the account, or defaults when there is nothing
 * stored yet.
 *
 * Never fails: the client returns defaults rather than throwing, because a
 * colour override going missing should not stop the app starting.
 */
export function usePreferences<T = Preferences>(
  accountId: string | null,
  userId: string | null,
  select?: (prefs: Preferences) => T,
) {
  return useQuery({
    queryKey: preferencesKey(accountId, userId),
    queryFn: () => fetchPreferences(accountId as string, userId as string),
    enabled: accountId != null && userId != null,
    staleTime: STALE_MS,
    select,
  })
}

/**
 * Everyone, with the colour this user sees them in — the join every screen
 * that shows a person makes. `colors` is the lookup by id; `withColors` is the
 * list in lane order, for chips and lane heads. Pending until the people are.
 */
export function usePeopleWithColors(accountId: string | null, userId: string | null) {
  const { data: people = [], isPending } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, userId, personColors)
  return useMemo(() => {
    const colors = personColorMap(people, overrides)
    const withColors = people.map((person) => ({ person, color: colors[person.id] }))
    return { people, overrides, colors, withColors, isPending }
  }, [people, overrides, isPending])
}
