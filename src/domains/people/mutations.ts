/**
 * Changing people.
 *
 * The behaviour lives in defaults registered against the query client, not
 * inside the hook. That is what makes a write survive being offline: a paused
 * write is saved with only its key and its values, and after a restart the
 * runtime finds how to run it by looking the key up here. So the values have to
 * carry everything the write needs — no reaching back into anything that was
 * only around when the button was pressed.
 *
 * Nothing imports the app's query client. Call `registerPeopleDefaults` once at
 * start-up, after the account is known and before any paused writes are
 * resumed.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import type { ColorKey } from '../../assets/palette'
import { recolorPerson, renamePerson } from '../../client/people'
import { patchRecolor, patchRename } from './patches'
import { peopleKey } from './queries'
import type { Person, PersonId } from './types'

/** Every change to a person, as one set of values that can be written down. */
export type PeopleWrite =
  | { kind: 'rename'; id: PersonId; name: string }
  | { kind: 'recolor'; id: PersonId; color: ColorKey }

const PEOPLE_WRITE_KEY = ['people-write'] as const

/**
 * Teach the query client how to run people writes.
 *
 * `accountId` fixes which cached list gets patched, and groups these writes
 * with the account's others so they go out in the order they were made — a
 * rename landing before the recolour that followed it, even after a spell
 * offline.
 */
export function registerPeopleDefaults(queryClient: QueryClient, accountId: string): void {
  const key = peopleKey(accountId)

  queryClient.setMutationDefaults(PEOPLE_WRITE_KEY, {
    scope: { id: accountId },
    mutationFn: (w: PeopleWrite) =>
      w.kind === 'rename' ? renamePerson(w.id, w.name) : recolorPerson(w.id, w.color),

    // Show the change straight away and keep the old list to fall back on. A
    // write resumed after a restart has nothing to fall back to, and needs
    // none: the saved cache already shows the change, and the refresh on
    // settle is what makes it true.
    onMutate: async (w: PeopleWrite) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Person[]>(key)
      if (previous) {
        queryClient.setQueryData<Person[]>(
          key,
          w.kind === 'rename'
            ? patchRename(previous, w.id, w.name)
            : patchRecolor(previous, w.id, w.color),
        )
      }
      return { previous }
    },
    onError: (_err, _w, ctx) => {
      const previous = (ctx as { previous?: Person[] } | undefined)?.previous
      if (previous) queryClient.setQueryData(key, previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * Make a change to a person.
 *
 * One hook for both changes rather than one each, so every people write shares
 * an identity and an order. Which change it is rides in the values:
 * `mutate({ kind: 'rename', id, name })`.
 */
export function usePeopleWrite() {
  return useMutation<void, Error, PeopleWrite>({ mutationKey: [...PEOPLE_WRITE_KEY] })
}
