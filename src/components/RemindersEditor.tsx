import shared from '../assets/styles/shared.module.css'
import { cx } from '../assets/utils/cx'
import { uid } from '../assets/utils/id'
import { REMINDER_OFFSETS, offsetLabel } from '../services/notifications/alerts'
import type { EventReminder } from '../types'

/**
 * Shared editor for the reminders an event or template carries. Owns no state of
 * its own — it edits the passed `reminders` array through `onChange`, so
 * EventEditor and the Settings template editor stay in sync on what one is.
 */
export function RemindersEditor({
  reminders,
  onChange,
}: {
  reminders: EventReminder[]
  onChange: (next: EventReminder[]) => void
}) {
  const chosen = new Set(reminders.map((r) => r.offset))

  function toggle(offset: number) {
    onChange(
      chosen.has(offset)
        ? reminders.filter((r) => r.offset !== offset)
        : [...reminders, { id: uid(), offset }],
    )
  }

  return (
    <>
      <label className={shared.label}>Remind me</label>
      <div className={shared.chips}>
        {REMINDER_OFFSETS.map((o) => {
          const on = chosen.has(o)
          return (
            <button
              type="button"
              key={o}
              className={cx(shared.chip, on && shared.on)}
              style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
              onClick={() => toggle(o)}
            >
              {offsetLabel(o)}
            </button>
          )
        })}
      </div>
    </>
  )
}
