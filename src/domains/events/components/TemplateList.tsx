import { Edit, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { colorStyle } from '../../../assets/palette'
import { ConfirmDialog } from '../../../assets/ui/ConfirmDialog'
import { IconButton } from '../../../assets/ui/IconButton'
import { durationLabel } from '../selectors'
import type { EventTemplate } from '../types'
import styles from './TemplateList.module.css'

/**
 * The saved templates, one row each, with a way to open and delete each.
 * A row shows what an event made from the template comes out as: painted the
 * way an event block is, in the template's colour, with how long it runs and
 * how many reminders it carries. Deleting asks first; `onDelete` is only
 * called once the dialog is confirmed.
 */
export function TemplateList({
  templates,
  loading,
  onOpen,
  onDelete,
}: {
  templates: EventTemplate[]
  loading?: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  // The template whose delete is being confirmed, if any. UI state only.
  const [pending, setPending] = useState<EventTemplate | null>(null)

  return (
    <div className={styles.TemplateList}>
      <p className={styles.hint}>
        Reusable blueprints. Pick one when creating an event to prefill its title, length, colour
        and reminders. Save one from the event editor, or start one with the + above.
      </p>
      {loading ? (
        <p className={styles.empty}>Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className={styles.empty}>No templates yet.</p>
      ) : (
        templates.map((t) => (
          <div className={styles.row} key={t.id} style={colorStyle(t.colorKey)}>
            <div className={styles.info}>
              <strong>{t.title || 'Untitled template'}</strong>
              <span className={styles.meta}>{describe(t)}</span>
            </div>
            <IconButton
              danger
              onClick={() => setPending(t)}
              label={`Delete template ${t.title || 'Untitled'}`}
              icon={Trash2}
              small
            />
            <IconButton
              onClick={() => onOpen(t.id)}
              label={`Edit template ${t.title || 'Untitled'}`}
              icon={Edit}
              small
            />
          </div>
        ))
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Delete template?"
        message={`“${pending?.title || 'Untitled template'}” will be removed. Events made from it are kept.`}
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

/** "1 h 30 min · 2 reminders" — the length always, the reminders when there are any. */
function describe(t: EventTemplate): string {
  const bits = [durationLabel(t)]
  const n = t.reminders.length
  if (n) bits.push(`${n} reminder${n > 1 ? 's' : ''}`)
  return bits.join(' · ')
}
