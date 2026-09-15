import { Edit, Trash2 } from 'lucide-react'
import { cx } from '../../../assets/utils/cx'
import styles from './TemplateList.module.css'

/** One row of the list: a template, described. */
export interface TemplateItem {
  id: string
  title: string
  /** "Kid · 2 reminders" — the caller joins the names in. */
  meta: string
}

/**
 * The saved templates, one row each, with a way to open, delete and add.
 * Takes rows already described, because who is on a template is a join with
 * the people list.
 */
export function TemplateList({
  items,
  loading,
  onOpen,
  onDelete,
  onNew,
}: {
  items: TemplateItem[]
  loading?: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className={styles.TemplateList}>
      <p className={styles.hint}>
        Reusable blueprints. Pick one when creating an event to prefill its people and reminders.
        Save one from the event editor, or start one here.
      </p>
      {loading ? (
        <p className={styles.empty}>Loading templates…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>No templates yet.</p>
      ) : (
        items.map((t) => (
          <div className={styles.row} key={t.id}>
            <div className={styles.info}>
              <strong>{t.title || 'Untitled template'}</strong>
              {t.meta && <span className={styles.meta}>{t.meta}</span>}
            </div>
            <button
              type="button"
              className={cx(styles.button, styles.delete)}
              onClick={() => onDelete(t.id)}
              aria-label={`Delete template ${t.title || 'Untitled'}`}
            >
              <Trash2 size={20} />
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => onOpen(t.id)}
              aria-label={`Edit template ${t.title || 'Untitled'}`}
            >
              <Edit size={20} />
            </button>
          </div>
        ))
      )}
      <button type="button" className={styles.add} onClick={onNew}>
        + New template
      </button>
    </div>
  )
}
