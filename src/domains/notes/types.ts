/**
 * Notes: the documents written in the Notes editor.
 *
 * The client's rows already have the shape the app wants, so these are its
 * declarations, not a copy. `NoteBody` is the sealed document — nothing in
 * this domain, or above it, looks inside one.
 */
export type { Note, NoteBody } from '../../client/notes'
