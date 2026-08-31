/**
 * Reading this user's settings.
 *
 * Personal, so the query is keyed by the user as well as the account — two
 * partners sharing an account each have their own.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchPreferences } from '../../client/preferences'
import type { Preferences } from './types'

export const preferencesKey = (accountId: string | null, userId: string | null) =>
  ['preferences', accountId, userId] as const

const STALE_MS = 5 * 60_000

/**
 * This user's settings, or defaults when there is nothing stored yet.
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
