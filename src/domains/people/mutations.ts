/**
 * Changing people.
 *
 * The behaviour lives in defaults registered against the query client, not
 * inside the hook. That is what makes a write survive being offline: a paused
 * write is saved with only its key and its values, and after a restart the
 * runtime finds how to run it by looking the key up here. So the values have to
 * carry everything the write needs — the account included, which is why it
 * rides in the values rather than being handed to the register function.
 *
 * Nothing imports the app's query client, and registering asks nothing of the
 * session, so `registerPeopleDefaults` can run at start-up before anything is
 * read back out of storage.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { APP_SCOPE } from '../../assets/constants'
import type { ColorKey } from '../../assets/palette'
import { type Rollback, rollback } from '../../assets/rollback'
import { recolorPerson, renamePerson } from '../../client/people'
import { savePreferences } from '../../client/preferences'
import { patchRecolor, patchRename } from './patches'
import { peopleKey, preferencesKey } from './queries'
import type { Person, PersonId, Preferences } from './types'

/** Every change to a person, as one set of values that can be written down. */
export type PeopleChange =
  | { kind: 'rename'; id: PersonId; name: string }
  | { kind: 'recolor'; id: PersonId; color: ColorKey }

/** What `mutate()` takes: the change, and the account it belongs to. */
export type PeopleWrite = { accountId: string; change: PeopleChange }

const PEOPLE_WRITE_KEY = ['people-write'] as const

/**
 * What saving this user's settings takes: the whole document, plus who it
 * belongs to. Settings are one document, saved whole, so the write carries the
 * complete document rather than the one field that changed — build it with the
 * helpers in ./patches. Two devices changing different settings at once means
 * the last one to arrive wins for all of them.
 */
export type PreferencesWrite = {
  accountId: string
  userId: string
  prefs: Preferences
}

const PREFERENCES_WRITE_KEY = ['preferences-write'] as const

/**
 * Teach the query client how to run people writes.
 *
 * Every write in the app shares one scope, so they go out in the order they
 * were made — a rename landing before the recolour that followed it, even
 * after a spell offline.
 */
export function registerPeopleDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(PEOPLE_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: ({ change: c }: PeopleWrite) =>
      c.kind === 'rename' ? renamePerson(c.id, c.name) : recolorPerson(c.id, c.color),

    // Show the change straight away and keep the old list to fall back on.
    onMutate: async ({ accountId, change: c }: PeopleWrite): Promise<Rollback> => {
      const key = peopleKey(accountId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Person[]>(key)
      if (previous) {
        queryClient.setQueryData<Person[]>(
          key,
          c.kind === 'rename'
            ? patchRename(previous, c.id, c.name)
            : patchRecolor(previous, c.id, c.color),
        )
      }
      return { entries: previous ? [[key, previous]] : [] }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId }: PeopleWrite) => {
      void queryClient.invalidateQueries({ queryKey: peopleKey(accountId) })
    },
  })

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
      void queryClient.invalidateQueries({ queryKey: preferencesKey(vars.accountId, vars.userId) })
    },
  })
}

/**
 * Make a change to a person.
 *
 * One hook for both changes rather than one each, so every people write shares
 * an identity and an order. Which change it is rides in the values:
 * `mutate({ accountId, change: { kind: 'rename', id, name } })`.
 */
export function usePeopleWrite() {
  return useMutation<void, Error, PeopleWrite>({ mutationKey: [...PEOPLE_WRITE_KEY] })
}

/**
 * Save this user's settings.
 *
 * `mutate({ accountId, userId, prefs: withTimezone(prefs, 'Europe/Amsterdam') })` —
 * the whole document, with the one change made.
 */
export function usePreferencesWrite() {
  return useMutation<void, Error, PreferencesWrite>({
    mutationKey: [...PREFERENCES_WRITE_KEY],
  })
}
