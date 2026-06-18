import { useApp } from '../state'
import type { CalendarEvent } from '../types'
import { minutesToTime } from '../lib/dates'
import { eventStartMinutes, eventSpanDays, MINS_PER_DAY } from '../lib/timing'
import { attendeeLabel } from '../lib/people'
import { checklists, notes, reminderOffsets } from '../lib/attachments'
import { blockingPrerequisites, isOccurrenceDone, occKey } from '../lib/occurrences'
import { offsetLabel } from '../lib/notifications'
import { recurrenceLabel } from '../lib/recurrence'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import s from './OccurrenceSheet.module.css'

/**
 * A single occurrence of an event on a date: the place to tick it off, work its
 * checklist, and see what it's waiting on. Editing the *template* hands off to
 * the EventEditor.
 */
export function OccurrenceSheet({
  event,
  date,
  onEdit,
  onClose,
}: {
  event: CalendarEvent
  date: string
  onEdit: () => void
  onClose: () => void
}) {
  const { state, dispatch } = useApp()
  const cls = checklists(event).filter((c) => c.items.length > 0)
  const hasChecklist = cls.length > 0
  const done = isOccurrenceDone(state, event, date)
  const checked = state.completions[occKey(event.id, date)]?.checked ?? {}
  const blockers = blockingPrerequisites(state, event, date)

  const startMin = eventStartMinutes(event)
  const endMin = startMin + event.duration
  const span = eventSpanDays(event)
  const timeLabel = event.allDay
    ? span > 1
      ? `All day · ${span} days`
      : 'All day'
    : `${minutesToTime(startMin)}–${minutesToTime(endMin % MINS_PER_DAY)}${span > 1 ? ` (+${span - 1}d)` : ''}`

  return (
    <div className={shared.editorPage}>
      <header className={shared.editorHead}>
        <button type="button" className={shared.editorCancel} onClick={onClose}>
          Close
        </button>
        <strong className={cx(done && s.doneTitle)}>{event.title}</strong>
        <button type="button" className={shared.primary} onClick={onEdit}>
          Edit
        </button>
      </header>

      <div className={shared.editorBody}>
        <p className={s.meta}>
          {timeLabel} · {attendeeLabel(state, event.attendees)}
          {event.recurrence && ` · ${recurrenceLabel(event.recurrence).toLowerCase()}`}
        </p>

        {blockers.length > 0 && (
          <p className={s.waiting}>⏳ Waiting on {blockers.map((b) => b.title).join(', ')}</p>
        )}

        {hasChecklist ? (
          cls.map((c) => (
            <div key={c.id} className={s.checklist}>
              {c.title && <h4 className={s.checklistTitle}>{c.title}</h4>}
              <ul className={s.checklistItems}>
                {c.items.map((it) => (
                  <li key={it.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!checked[it.id]}
                        onChange={() =>
                          dispatch({ type: 'toggleChecklistEntry', eventId: event.id, date, entryId: it.id })
                        }
                      />
                      <span className={cx(checked[it.id] && s.doneTitle)}>{it.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <label className={s.doneToggle}>
            <input
              type="checkbox"
              checked={done}
              onChange={(e) =>
                dispatch({ type: 'setOccurrenceDone', eventId: event.id, date, done: e.target.checked })
              }
            />
            Mark done
          </label>
        )}

        {notes(event).map((n) => (
          <p key={n.id} className={s.note}>
            {n.text}
          </p>
        ))}

        {reminderOffsets(event).length > 0 && (
          <div className={s.reminders}>
            {reminderOffsets(event).map((o) => (
              <span key={o} className={s.reminderChip}>
                🔔 {offsetLabel(o)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
