/**
 * Reading the account's notes.
 *
 * One query holding every note, body included. There are a handful per
 * account and each is small, so one read serves the list and every editor,
 * and a note opened offline is already here. Screens narrow it with a
 * selector from ./selectors.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchNotes } from '../../client/notes'
import type { Note } from './types'

/** Everything cached under this domain, for invalidating the lot. */
export const notesKey = (accountId: string | null) => ['notes', accountId] as const

// A change made elsewhere arrives over the realtime channel, so there is
// nothing to gain from refetching on every mount and focus.
const STALE_MS = 5 * 60_000

/**
 * Every note in the account, most recently saved first.
 *
 * Pass a selector from ./selectors for a narrower shape. One built at the call
 * site (`noteFor(id)`) must be held steady with `useMemo`, or it counts as a
 * new selector on every render. Waits until there is an account to read.
 */
export function useNotes<T = Note[]>(accountId: string | null, select?: (notes: Note[]) => T) {
  return useQuery({
    queryKey: notesKey(accountId),
    queryFn: () => fetchNotes(accountId as string),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}
