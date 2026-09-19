/**
 * Notes (`note`): small documents written in the Notes editor.
 *
 * A note's `body` is the editor's own document, stored as one JSON column.
 * The app never looks inside it: it reads the column whole, hands it to the
 * editor library, and writes back whatever the library gives it. `NoteBody`
 * is the app's one name for that sealed value, and this file is the one place
 * it is tied to the library's type (docs/NOTE_MODEL.md, Decision 13).
 *
 * A note either stands on its own or belongs to an event series. Only the
 * standalone kind is written today; `ownerSeriesId` is read so the list can
 * tell them apart once series notes exist.
 */
import { type NoteDoc, serializeDoc } from '@mikrostack/notes'
import type { Json } from './database.types'
import { fetchAll } from './pagination'
import { supabase } from './supabase'

/** The editor's document, sealed. Only the editor library reads or makes one. */
export type NoteBody = NoteDoc

export interface Note {
  id: string
  title: string
  /** The series this note belongs to; null for a note that stands on its own. */
  ownerSeriesId: string | null
  /** Who wrote it. A filter for mine and theirs, never reassigned. */
  authorId: string
  body: NoteBody
  /** When it was last saved, as an ISO instant. */
  updatedAt: string
}

/** The document a new note starts from: no rows, which the editor shows as one blank row. */
export function emptyBody(): NoteBody {
  return serializeDoc([])
}

/**
 * Every note in the account, most recently saved first.
 *
 * Bodies come along: a note is kilobytes and the account has a handful, so
 * one read serves the list and every editor, and the whole lot is in the
 * offline cache.
 */
export async function fetchNotes(accountId: string): Promise<Note[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from('note')
      .select('id, title, owner_series_id, author_id, body, updated_at')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    ownerSeriesId: r.owner_series_id,
    authorId: r.author_id,
    body: r.body as NoteBody,
    updatedAt: r.updated_at,
  }))
}

/**
 * Save a note, whole: its title and its complete document.
 *
 * A new note is upserted with its author, so a save replayed after a lost
 * response finds its row already there and rewrites it. An existing note is
 * updated without touching the author: saving someone else's note must not
 * make it yours. Ownership is not written at all — a standalone note stays
 * standalone.
 */
export async function saveNote(
  accountId: string,
  userId: string,
  note: Pick<Note, 'id' | 'title' | 'body'>,
  { isNew }: { isNew: boolean },
): Promise<void> {
  const fields = {
    title: note.title,
    // The editor's document is structured; the column is free-form Json.
    body: note.body as unknown as Json,
    updated_at: new Date().toISOString(),
  }
  const { error } = isNew
    ? await supabase
        .from('note')
        .upsert(
          { id: note.id, account_id: accountId, author_id: userId, ...fields },
          { onConflict: 'id' },
        )
    : await supabase.from('note').update(fields).eq('id', note.id)
  if (error) throw error
}

/** Remove a note for everyone in the account. */
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('note').delete().eq('id', id)
  if (error) throw error
}
