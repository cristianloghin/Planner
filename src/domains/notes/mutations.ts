/**
 * Changing notes.
 *
 * A save carries the whole note — title and complete document — so the
 * values are enough on their own: a write paused offline and replayed after a
 * restart has everything it needs (docs/NOTE_MODEL.md, Decision 12).
 *
 * Registering asks nothing of the session — the account and user ride in
 * each write's values — so `registerNotesDefaults` runs at start-up before
 * anything is read back out of storage.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { APP_SCOPE } from '../../assets/constants'
import { type Rollback, rollback } from '../../assets/rollback'
import { deleteNote, saveNote } from '../../client/notes'
import { patchRemoveNote, patchSaveNote } from './patches'
import { notesKey } from './queries'
import type { Note } from './types'

/**
 * Every change to a note, as one set of values that can be written down.
 *
 * A new note carries its id, minted by the caller before the first save, so
 * the editor can keep saving it before the first write has landed.
 */
export type NotesChange =
  | { kind: 'saveNote'; note: Note; isNew: boolean }
  | { kind: 'removeNote'; id: string }

/** What `mutate()` takes: the change, plus the account and user it belongs to. */
export type NotesWrite = { accountId: string; userId: string; change: NotesChange }

const NOTES_WRITE_KEY = ['notes-write'] as const

/**
 * Teach the query client how to run notes writes. Every write in the app
 * shares one scope, so they go out in the order they were made.
 */
export function registerNotesDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(NOTES_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: ({ accountId, userId, change: c }: NotesWrite) =>
      c.kind === 'saveNote'
        ? saveNote(accountId, userId, c.note, { isNew: c.isNew })
        : deleteNote(c.id),

    // Show the change straight away and keep the old list to fall back on.
    onMutate: async ({ accountId, change: c }: NotesWrite): Promise<Rollback> => {
      const key = notesKey(accountId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Note[]>(key)
      if (previous) {
        queryClient.setQueryData<Note[]>(
          key,
          c.kind === 'saveNote' ? patchSaveNote(previous, c.note) : patchRemoveNote(previous, c.id),
        )
      }
      return { entries: previous ? [[key, previous]] : [] }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId }: NotesWrite) => {
      void queryClient.invalidateQueries({ queryKey: notesKey(accountId) })
    },
  })
}

/**
 * Make a change to a note.
 *
 * `mutate({ accountId, userId, change: { kind: 'saveNote', note, isNew: true } })`
 */
export function useNotesWrite() {
  return useMutation<void, Error, NotesWrite>({ mutationKey: [...NOTES_WRITE_KEY] })
}
