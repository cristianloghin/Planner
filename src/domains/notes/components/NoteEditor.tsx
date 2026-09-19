import { Editor } from '@mikrostack/notes'
import { Check } from 'lucide-react'
import { cx } from '../../../assets/utils/cx'
import styles from './NoteEditor.module.css'

/**
 * A note's rows, as the editor library lays them out and the app draws them:
 * a heading, a checklist item with its tick, or a paragraph. Reads the note
 * from the library's own provider, which the route wraps around it; it takes
 * nothing else. The row markup is all here — the library ships none.
 *
 * `ticks` is off for a note that belongs to a series: what is done is a
 * fact about one day, not about the series, and lives with the day
 * (docs/NOTE_MODEL.md, Decision 10). The circles are drawn but inert.
 */
export function NoteEditor({ ticks = true }: { ticks?: boolean }) {
  return (
    <Editor className={styles.NoteEditor}>
      {({ row, fieldProps, checkboxProps }) =>
        row.type === 'header' ? (
          <div className={cx(styles.row, styles.header)} role="listitem">
            <textarea className={styles.field} aria-label="Heading" {...fieldProps} />
          </div>
        ) : row.type === 'text' ? (
          <div className={cx(styles.row, styles.text)} role="listitem">
            <textarea className={styles.field} aria-label="Paragraph" {...fieldProps} />
          </div>
        ) : (
          <div className={cx(styles.row, styles.item, row.done && styles.done)} role="listitem">
            {ticks ? (
              <button
                type="button"
                className={styles.check}
                aria-label={row.done ? 'Mark not done' : 'Mark done'}
                aria-pressed={row.done}
                {...checkboxProps}
              >
                {row.done && <Check size={14} strokeWidth={3} />}
              </button>
            ) : (
              <span className={cx(styles.check, styles.inert)} aria-hidden="true" />
            )}
            <textarea className={styles.field} aria-label="Checklist item" {...fieldProps} />
          </div>
        )
      }
    </Editor>
  )
}
