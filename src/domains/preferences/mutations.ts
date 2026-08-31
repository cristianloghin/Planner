/**
 * Saving this user's settings.
 *
 * Settings are one document, saved whole, so the write carries the complete
 * document to store rather than the one field that changed. Build it with the
 * helpers in ./patches. Two devices changing different settings at once means
 * the last one to arrive wins for all of them — which is how it already works.
 *
 * Call `registerPreferencesDefaults` once at start-up, after the account and
 * user are known and before any paused writes are resumed.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { savePreferences } from '../../client/preferences'
import { preferencesKey } from './queries'
import type { Preferences } from './types'

const PREFERENCES_WRITE_KEY = ['preferences-write'] as const

export function registerPreferencesDefaults(
  queryClient: QueryClient,
  accountId: string,
  userId: string,
): void {
  const key = preferencesKey(accountId, userId)

  queryClient.setMutationDefaults(PREFERENCES_WRITE_KEY, {
    scope: { id: accountId },
    mutationFn: (prefs: Preferences) => savePreferences(accountId, userId, prefs),

    // The document being saved is also exactly what to show, so there is
    // nothing to work out here.
    onMutate: async (prefs: Preferences) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Preferences>(key)
      queryClient.setQueryData<Preferences>(key, prefs)
      return { previous }
    },
    onError: (_err, _prefs, ctx) => {
      const previous = (ctx as { previous?: Preferences } | undefined)?.previous
      if (previous) queryClient.setQueryData(key, previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * Save the settings.
 *
 * `mutate(withWeekLayout(prefs, 'timeline'))` — the whole document, with the
 * one change made.
 */
export function usePreferencesWrite() {
  return useMutation<void, Error, Preferences>({ mutationKey: [...PREFERENCES_WRITE_KEY] })
}
