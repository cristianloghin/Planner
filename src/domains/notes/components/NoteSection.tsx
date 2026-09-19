import { Plus, Trash2 } from 'lucide-react'
import shared from '../../../assets/styles/shared.module.css'
import { Button } from '../../../assets/ui/Button'
import { IconButton } from '../../../assets/ui/IconButton'
import { NoteEditor } from './NoteEditor'
import styles from './NoteSection.module.css'

/**
 * A note inside another editor, where a note is optional: a button to add
 * one, or the editor under a "Note" label with a bin that takes the whole
 * note away in one tap. Reads the note from the library's provider the
 * route wraps around it, and reports adding and removing upward; what a
 * save then writes is the route's decision.
 */
export function NoteSection({
  present,
  onAdd,
  onRemove,
  ticks,
}: {
  present: boolean
  onAdd: () => void
  onRemove: () => void
  ticks?: boolean
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
        <IconButton danger small label="Remove note" icon={Trash2} onClick={onRemove} />
      </div>
      <NoteEditor ticks={ticks} />
    </div>
  )
}
