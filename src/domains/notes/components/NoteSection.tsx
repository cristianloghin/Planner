import { useNote } from '@mikrostack/notes'
import { Edit, Plus, Trash2 } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import shared from '../../../assets/styles/shared.module.css'
import { Button } from '../../../assets/ui/Button'
import { IconButton } from '../../../assets/ui/IconButton'
import styles from './NoteSection.module.css'
import { NoteView } from './NoteView'

/**
 * A note inside another editor, where a note is optional: a button to add
 * one, or the note as it stands under a "Note" label, read only, with a bin
 * that takes the whole note away in one tap. The note is edited elsewhere —
 * on a page of its own that the route opens — so a tap on the preview, or on
 * the edit button, asks for that. Reads the note from the library's provider
 * the route wraps around it, and reports adding, editing and removing upward;
 * what a save then writes is the route's decision.
 */
export function NoteSection({
  present,
  onAdd,
  onEdit,
  onRemove,
}: {
  present: boolean
  onAdd: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  if (!present) {
    return (
      <div className={styles.NoteSection}>
        <Button label="Add a note" onClick={onAdd}>
          <Plus size={18} aria-hidden /> Add a note
        </Button>
      </div>
    )
  }
  return (
    <div className={styles.NoteSection}>
      <div className={styles.head}>
        <span className={shared.label}>Note</span>
        <div className={styles.actions}>
          <IconButton danger small label="Remove note" icon={Trash2} onClick={onRemove} />
          <IconButton small label="Edit note" icon={Edit} onClick={onEdit} />
        </div>
      </div>
      <Preview onEdit={onEdit} />
    </div>
  )
}

/** The rows as they stand, drawn read only; the whole thing opens the editor. */
function Preview({ onEdit }: { onEdit: () => void }) {
  const { state } = useNote()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onEdit()
    }
  }
  return (
    <div
      className={styles.preview}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <NoteView rows={state.rows} />
    </div>
  )
}
