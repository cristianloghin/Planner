/**
 * One person editing one note: the editor's store, seeded from the note as
 * opened, and the edits made since. Nothing is written here — the route
 * takes `draft()` when the user saves and hands it to the domain, the way
 * the template editor hands over its draft.
 */
import { type SerializeOptions, parseDoc, useNoteStore } from '@mikrostack/notes'
import { useCallback, useEffect, useState } from 'react'
import type { NoteBody } from '../../client/notes'
import { NOTHING_UNSAVED, hasChanges, pendingBody, recordEdit, recordTitle } from './session'

export function useNoteSession({
  title,
  body,
  deletes,
}: {
  /** The note as opened. Read once; later values are ignored. */
  title: string
  body: NoteBody
  /** How a removed row is recorded: dropped for a standalone note, tombstoned for a series note. */
  deletes: SerializeOptions['deletes']
}) {
  // The note as opened, held for the session: what the editor was seeded
  // from and what every patch is applied to.
  const [opened] = useState({ title, body })
  const store = useNoteStore({ initial: parseDoc(opened.body) })
  const [unsaved, setUnsaved] = useState(NOTHING_UNSAVED)

  // Edits out: every change the editor reports becomes a patch.
  useEffect(
    () =>
      store.onAction((action, prev, next) => {
        setUnsaved((u) => recordEdit(u, opened.body, action, prev, next, deletes))
      }),
    [store, opened.body, deletes],
  )

  const setTitle = useCallback((next: string) => setUnsaved((u) => recordTitle(u, next)), [])

  return {
    store,
    title: unsaved.title ?? opened.title,
    setTitle,
    changed: hasChanges(unsaved, opened.title),
    /** The note as it stands: what a save writes. */
    draft: () => ({
      title: unsaved.title ?? opened.title,
      body: pendingBody(opened.body, unsaved),
    }),
  }
}
