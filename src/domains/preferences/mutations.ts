/**
 * Saving this user's settings.
 *
 * Settings are one document, saved whole, so the write carries the complete
 * document to store rather than the one field that changed. Build it with the
 * helpers in ./patches. Two devices changing different settings at once means
 * the last one to arrive wins for all of them — which is how it already works.
 *
 * Registering asks nothing of the session — the account and the user ride in
 * each write's values — so `registerPreferencesDefaults` can run at start-up
 * before anything is read back out of storage.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { APP_SCOPE } from '../../assets/constants'
import { type Rollback, rollback } from '../../assets/rollback'
import { savePreferences } from '../../client/preferences'
import { preferencesKey } from './queries'
import type { Preferences } from './types'

export const PREFERENCES_WRITE_KEY = ['preferences-write'] as const

/** What `mutate()` takes: the whole document, plus who it belongs to. */
export type PreferencesWrite = {
  accountId: string
  userId: string
  prefs: Preferences
}

export function registerPreferencesDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(PREFERENCES_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: ({ accountId, userId, prefs }: PreferencesWrite) =>
      savePreferences(accountId, userId, prefs),

    // The document being saved is also exactly what to show, so there is
    // nothing to work out here.
    onMutate: async ({ accountId, userId, prefs }: PreferencesWrite): Promise<Rollback> => {
      const key = preferencesKey(accountId, userId)

      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Preferences>(key)
      queryClient.setQueryData<Preferences>(key, prefs)
      return { entries: previous ? [[key, previous]] : [] }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, vars) => {
      const key = preferencesKey(vars.accountId, vars.userId)
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * Save the settings.
 *
 * `mutate({ accountId, userId, prefs: withWeekLayout(prefs, 'timeline') })` —
 * the whole document, with the one change made.
 */
export function usePreferencesWrite() {
  return useMutation<void, Error, PreferencesWrite>({
    mutationKey: [...PREFERENCES_WRITE_KEY],
  })
}
