/**
 * One person editing one note: the editor's store, seeded from the note as
 * opened, and the edits made since. Nothing is written here — the route
 * takes `draft()` when the user saves and hands it to the domain, the way
 * the template editor hands over its draft.
 */
import { type SerializeOptions, parseDoc, useNoteStore } from '@mikrostack/notes'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteBody } from '../../client/notes'
import { NOTHING_UNSAVED, hasChanges, pendingBody, recordEdit, recordTitle } from './session'

export function useNoteSession({
  title,
  body,
  deletes,
  seedKey = 'opened',
}: {
  /**
   * The note as opened. Read once, and again whenever `seedKey` changes —
   * never when only the values do, so a note re-read mid-edit cannot take
   * the edits away.
   */
  title: string
  body: NoteBody
  /** How a removed row is recorded: dropped for a standalone note, tombstoned for a series note. */
  deletes: SerializeOptions['deletes']
  /**
   * Names what the editor was seeded from. Change it to start over from the
   * current `title` and `body` — an event editor does so when a template is
   * picked, so the template's note appears ready to edit.
   */
  seedKey?: string
}) {
  // The note as opened, held for the session: what the editor was seeded
  // from and what every patch is applied to.
  const [opened, setOpened] = useState({ title, body })
  const store = useNoteStore({ initial: parseDoc(opened.body) })
  const [unsaved, setUnsaved] = useState(NOTHING_UNSAVED)

  // Reseed on demand: the store takes the new rows as an external update,
  // and the session forgets what was edited before.
  const reseed = useCallback(
    (next: { title: string; body: NoteBody }) => {
      setOpened(next)
      setUnsaved(NOTHING_UNSAVED)
      store.applyExternal(parseDoc(next.body))
    },
    [store],
  )
  const latest = useRef({ title, body })
  latest.current = { title, body }
  const seededFrom = useRef(seedKey)
  useEffect(() => {
    if (seededFrom.current === seedKey) return
    seededFrom.current = seedKey
    reseed(latest.current)
  }, [seedKey, reseed])

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
    /** Start over from another note, forgetting the edits made so far. */
    reseed,
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
