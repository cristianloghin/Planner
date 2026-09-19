/**
 * What the cached notes list looks like the moment a change is made, before
 * the server has confirmed it. Pure, so the rules the screen shows instantly
 * can be tested without a cache.
 */
import type { Note } from './types'

/**
 * The list with one note saved. A note already in the list is replaced; a new
 * one is added. Either way it moves to the front, because the list is most
 * recently saved first and this is the most recent save.
 */
export function patchSaveNote(notes: Note[], note: Note): Note[] {
  return [note, ...notes.filter((n) => n.id !== note.id)]
}

/** The list without one note. Unknown ids leave it untouched. */
export function patchRemoveNote(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id)
}
