import { Edit, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../../../assets/ui/ConfirmDialog'
import { IconButton } from '../../../assets/ui/IconButton'
import type { Note } from '../types'
import styles from './NoteList.module.css'

/**
 * The standalone notes: this user's, then everyone else's, most recently
 * saved first, one row each with a way to open and delete each — the shape
 * of the template list. Deleting asks first; `onDelete` is only called once
 * the dialog is confirmed.
 */
export function NoteList({
  mine,
  theirs,
  loading,
  onOpen,
  onDelete,
}: {
  mine: Note[]
  theirs: Note[]
  loading?: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  // The note whose delete is being confirmed, if any. UI state only.
  const [pending, setPending] = useState<Note | null>(null)

  const rows = (notes: Note[]) =>
    notes.map((n) => (
      <div className={styles.row} key={n.id}>
        <div className={styles.info}>
          <strong>{n.title || 'Untitled note'}</strong>
          <span className={styles.meta}>{savedLabel(n.updatedAt)}</span>
        </div>
        <IconButton
          danger
          onClick={() => setPending(n)}
          label={`Delete note ${n.title || 'Untitled'}`}
          icon={Trash2}
          small
        />
        <IconButton
          onClick={() => onOpen(n.id)}
          label={`Edit note ${n.title || 'Untitled'}`}
          icon={Edit}
          small
        />
      </div>
    ))

  return (
    <div className={styles.NoteList}>
      <p className={styles.hint}>
        Lists, instructions, a scribble — notes are yours to keep, and everyone in the account can
        read them. Start one with the + above.
      </p>
      {loading ? (
        <p className={styles.empty}>Loading notes…</p>
      ) : mine.length + theirs.length === 0 ? (
        <p className={styles.empty}>No notes yet.</p>
      ) : (
        <>
          {rows(mine)}
          {theirs.length > 0 && (
            <>
              <h3 className={styles.section}>Theirs</h3>
              {rows(theirs)}
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Delete note?"
        message={`“${pending?.title || 'Untitled note'}” will be removed for everyone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pending) onDelete(pending.id)
          setPending(null)
        }}
      />
    </div>
  )
}

/** "Saved 19 Sep" — the day of the last save, in the device's locale. */
function savedLabel(updatedAt: string): string {
  const day = new Date(updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `Saved ${day}`
}
