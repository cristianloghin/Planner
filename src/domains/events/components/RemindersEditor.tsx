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
 * took in the form is the note's now. The dialog holds its own ticks until
 * Done, so Cancel leaves the reminders as they were; the event form and the
 * template editor agree on what a reminder is because the edit goes out
 * through `onChange` as a whole list.
 */
export function RemindersEditor({
  reminders,
  onChange,
}: {
  reminders: EventReminder[]
  onChange: (next: EventReminder[]) => void
}) {
  const [open, setOpen] = useState(false)
  // The ticks as they stand in the dialog; seeded from the reminders when it
  // opens and thrown away unless Done is pressed.
  const [ticked, setTicked] = useState<Set<number>>(() => new Set())
  const chosen = new Set(reminders.map((r) => r.offset))

  function openDialog(next: boolean) {
    if (next) setTicked(new Set(chosen))
    setOpen(next)
  }

  function tick(offset: number, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(offset)
      else next.delete(offset)
      return next
    })
  }

  /** Reminders already set keep their ids; new ones are minted. */
  function done() {
    onChange(
      REMINDER_OFFSETS.filter((o) => ticked.has(o)).map(
        (offset) => reminders.find((r) => r.offset === offset) ?? { id: uid(), offset },
      ),
    )
    setOpen(false)
  }

  // What is set, in the order the choices are offered — not the order they
  // were picked in.
  const summary = REMINDER_OFFSETS.filter((o) => chosen.has(o)).map(offsetLabel)

  return (
    <Dialog.Root open={open} onOpenChange={openDialog}>
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
          <div className={styles.choices}>
            {REMINDER_OFFSETS.map((o) => (
              <label key={o} className={shared.toggle}>
                <input
                  type="checkbox"
                  checked={ticked.has(o)}
                  onChange={(e) => tick(o, e.target.checked)}
                />
                {offsetLabel(o)}
              </label>
            ))}
          </div>
          <div className={dialog.actions}>
            <Dialog.Close asChild>
              <Button label="Cancel">Cancel</Button>
            </Dialog.Close>
            <Button label="Done" primary onClick={done}>
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
