/**
 * Whether the user is in a note right now: a row of the editor has the
 * focus. The toolbar that acts on the current row has no business on screen
 * otherwise, and the library does not say when a row is left — its caret
 * state stays where it was — so this watches the document's focus instead.
 *
 * A row is a textarea the library marks with `data-row-id`. Focus moving
 * from one row to the next is a leave and an arrival in the same tick, so
 * the leave is judged a moment later, against wherever focus ended up.
 */
import { useEffect, useState } from 'react'

const inNote = () => document.activeElement?.matches('textarea[data-row-id]') === true

export function useNoteFocus(): boolean {
  const [editing, setEditing] = useState(inNote)

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      clearTimeout(pending)
      pending = setTimeout(() => setEditing(inNote()), 0)
    }
    document.addEventListener('focusin', settle)
    document.addEventListener('focusout', settle)
    return () => {
      clearTimeout(pending)
      document.removeEventListener('focusin', settle)
      document.removeEventListener('focusout', settle)
    }
  }, [])

  return editing
}
