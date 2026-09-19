/**
 * The edits made to a note since it was opened, and the document they add
 * up to.
 *
 * Every edit the editor reports becomes a patch through the library, and
 * the patches are kept in order; the note to save is the one that was opened
 * with all of them applied. Nothing here names a key inside the document —
 * the library parses, patches and merges, and this only holds what it was
 * given (docs/NOTE_MODEL.md, Decision 13).
 */
import {
  type Action,
  type NotePatch,
  type Row,
  type SerializeOptions,
  actionToPatch,
  mergeDoc,
  parseDoc,
} from '@mikrostack/notes'
import type { NoteBody } from '../../client/notes'

/** What has changed since the note was opened. */
export interface Unsaved {
  /** The title as edited, or undefined while it has not been touched. */
  title?: string
  /** One patch per edit, oldest first. */
  patches: NotePatch[]
}

export const NOTHING_UNSAVED: Unsaved = { patches: [] }

/** Whether saving would write anything different from what was opened. */
export function hasChanges(unsaved: Unsaved, openedTitle: string): boolean {
  return (
    unsaved.patches.length > 0 || (unsaved.title !== undefined && unsaved.title !== openedTitle)
  )
}

/** The opened document with every edit applied — what the editor shows and what a save writes. */
export function pendingBody(opened: NoteBody, unsaved: Unsaved): NoteBody {
  return unsaved.patches.length === 0 ? opened : mergeDoc(opened, ...unsaved.patches)
}

/**
 * Record one edit. The patch is derived against the document as it stood
 * before the edit — the opened one plus everything since — so a sort key
 * minted for a new row sits between the neighbours the user actually saw.
 * `deletes` says whether a removed row is tombstoned or dropped; the caller
 * decides by ownership (Decision 6).
 */
export function recordEdit(
  unsaved: Unsaved,
  opened: NoteBody,
  action: Action,
  prevRows: Row[],
  nextRows: Row[],
  deletes: SerializeOptions['deletes'],
): Unsaved {
  const before = pendingBody(opened, unsaved)
  const patch = actionToPatch(action, prevRows, nextRows, before, { deletes })
  return { ...unsaved, patches: [...unsaved.patches, patch] }
}

/** Record a title edit. */
export function recordTitle(unsaved: Unsaved, title: string): Unsaved {
  return { ...unsaved, title }
}

/**
 * Whether a document says nothing: no rows, or only rows with no text. A
 * note on an event is optional, so an editor left blank creates no note.
 * Read through the library's rows, never the document's keys.
 */
export function isBlankBody(body: NoteBody): boolean {
  return parseDoc(body).every((row) => row.text.trim() === '')
}
