import type { Row } from '@mikrostack/notes'
import { Check } from 'lucide-react'
import { cx } from '../../../assets/utils/cx'
import styles from './NoteView.module.css'

/**
 * A note, read only: its rows as the library parsed them, drawn the way the
 * editor draws them but with nothing to type into. Ticks are shown as they
 * are and cannot be changed here.
 */
export function NoteView({ rows }: { rows: Row[] }) {
  return (
    <div className={styles.NoteView}>
      {rows.map((row) =>
        row.type === 'header' ? (
          <h3 key={row.id} className={styles.header}>
            {row.text}
          </h3>
        ) : row.type === 'text' ? (
          <p key={row.id} className={styles.text}>
            {row.text}
          </p>
        ) : (
          <p key={row.id} className={cx(styles.item, row.done && styles.done)}>
            <span className={styles.check} aria-hidden="true">
              {row.done && <Check size={12} strokeWidth={3} />}
            </span>
            {row.text}
          </p>
        ),
      )}
    </div>
  )
}
