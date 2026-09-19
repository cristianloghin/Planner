/**
 * A note that a series may or may not have, edited alongside the series.
 *
 * Adding one is a deliberate act and removing one is a single tap, both
 * held here until the form is saved: the route reads `present` and the
 * draft, and writes an insert, an update or a delete accordingly. The
 * editor follows whatever the note was opened on — the series' own note,
 * or the note of a template just picked — and starts empty on "add".
 */
import type { SerializeOptions } from '@mikrostack/notes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type NoteBody, emptyBody } from '../../client/notes'
import { useNoteSession } from './useNoteSession'

/** What a note editor opens on when there is no note: held once, so it never reseeds. */
const EMPTY_BODY = emptyBody()

export function useOptionalNote({
  body,
  deletes,
  seedKey = 'opened',
}: {
  /** The note as opened, or undefined when there is none. Read once, and again when `seedKey` changes. */
  body: NoteBody | undefined
  deletes: SerializeOptions['deletes']
  seedKey?: string
}) {
  const session = useNoteSession({ title: '', body: body ?? EMPTY_BODY, deletes, seedKey })
  const [present, setPresent] = useState(body !== undefined)

  // A new seed decides presence afresh: a template with a note brings it,
  // one without takes it away.
  const hasBody = useRef(body !== undefined)
  hasBody.current = body !== undefined
  const seededFrom = useRef(seedKey)
  useEffect(() => {
    if (seededFrom.current === seedKey) return
    seededFrom.current = seedKey
    setPresent(hasBody.current)
  }, [seedKey])

  const add = useCallback(() => {
    session.reseed({ title: '', body: EMPTY_BODY })
    setPresent(true)
  }, [session.reseed])
  const remove = useCallback(() => setPresent(false), [])

  return { ...session, present, add, remove }
}
