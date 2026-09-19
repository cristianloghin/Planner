import { Bell } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import shared from '../../../assets/styles/shared.module.css'
import { Button } from '../../../assets/ui/Button'
import dialog from '../../../assets/ui/Dialog.module.css'
import { IconButton } from '../../../assets/ui/IconButton'
import { cx } from '../../../assets/utils/cx'
import { offsetLabel } from '../../../assets/utils/dates'
import { uid } from '../../../assets/utils/id'
import { REMINDER_OFFSETS } from '../reminders'
import type { EventReminder } from '../types'
import styles from './RemindersEditor.module.css'

/**
 * The reminders an event or template carries: one line saying which, and a
 * bell that opens the choices in a dialog — the room the whole set of chips
 * took in the form is the note's now. Owns no state beyond whether the
 * dialog is open — it edits the passed `reminders` through `onChange`, so
 * the event form and the template editor agree on what one is.
 */
export function RemindersEditor({
  reminders,
  onChange,
}: {
  reminders: EventReminder[]
  onChange: (next: EventReminder[]) => void
}) {
  const [open, setOpen] = useState(false)
  const chosen = new Set(reminders.map((r) => r.offset))

  function toggle(offset: number) {
    onChange(
      chosen.has(offset)
        ? reminders.filter((r) => r.offset !== offset)
        : [...reminders, { id: uid(), offset }],
    )
  }

  // What is set, in the order the choices are offered — not the order they
  // were picked in.
  const summary = REMINDER_OFFSETS.filter((o) => chosen.has(o)).map(offsetLabel)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className={styles.RemindersEditor}>
        <div className={styles.summary}>
          <span className={shared.label}>Remind me</span>
          <span className={cx(styles.value, summary.length === 0 && styles.none)}>
            {summary.length === 0 ? 'No reminders' : summary.join(' · ')}
          </span>
        </div>
        <Dialog.Trigger asChild>
          <IconButton label="Choose reminders" icon={Bell} small />
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.content}>
          <Dialog.Title className={dialog.title}>Remind me</Dialog.Title>
          <div className={shared.chips}>
            {REMINDER_OFFSETS.map((o) => {
              const on = chosen.has(o)
              return (
                <button
                  type="button"
                  key={o}
                  className={cx(shared.chip, on && shared.on)}
                  style={
                    on ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined
                  }
                  aria-pressed={on}
                  onClick={() => toggle(o)}
                >
                  {offsetLabel(o)}
                </button>
              )
            })}
          </div>
          <div className={dialog.actions}>
            <Dialog.Close asChild>
              <Button label="Done" primary>
                Done
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
