import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '../account'
import shared from '../assets/styles/shared.module.css'
import { ConfirmDialog } from '../assets/ui/ConfirmDialog'
import { type ScopeChoice, ScopeSheet } from '../assets/ui/ScopeSheet'
import { PageLoader } from '../assets/ui/Spinner'
import { cx } from '../assets/utils/cx'
import { isoLabel, minutesToTime } from '../assets/utils/dates'
import { checklists, notes, reminderOffsets } from '../domains/events/attachments'
import { type EventsChange, useEventsWrite } from '../domains/events/mutations'
import { timingOf } from '../domains/events/selectors'
import { useOccurrencesWrite } from '../domains/occurrences/mutations'
import { useCompletionsForRange } from '../domains/occurrences/queries'
import { usePeople } from '../domains/people/queries'
import { attendeeLabelFor } from '../domains/people/selectors'
import { offsetLabel } from '../services/notifications/alerts'
import { effectiveOccurrence, recurrenceLabel } from '../services/recurrence/expand'
import { isOccurrenceDone, occKey } from '../services/recurrence/status'
import { MINS_PER_DAY, eventSpanDays, eventStartMinutes } from '../services/recurrence/timing'
import type { CalendarEvent } from '../types'
import s from './OccurrenceSheet.module.css'

/**
 * A single occurrence of an event on a date: the place to work its checklist,
 * and to move, cancel or delete the day. Editing the *series* hands off to the
 * EventEditor.
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
  const { accountId, userId } = useAccount()
  const { data: people = [] } = usePeople(accountId)
  const eventsWrite = useEventsWrite()
  const writeEvent = (change: EventsChange) =>
    eventsWrite.mutate({
      accountId: accountId,
      userId: userId,
      change,
    })
  const { completions, isLoading } = useCompletionsForRange(accountId, date, date)
  const occurrences = useOccurrencesWrite()

  // Delete asks two different questions. A one-off just needs confirming; a
  // series needs to know how far the delete reaches, and that action sheet is
  // itself the confirmation (so the two are mutually exclusive, never stacked).
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteScope, setDeleteScope] = useState(false)
  const isRecurring = !!event.recurrence

  const cls = checklists(event).filter((c) => c.items.length > 0)
  const hasChecklist = cls.length > 0
  const done = isOccurrenceDone(completions, event, date)
  const occState = completions[occKey(event.id, date)]
  const checked = occState?.checked ?? {}
  // A one-off override on this slot. `date` is the occurrence's identity (the day
  // the series would normally place it); if the override's start lands on another
  // day, it's been moved there.
  const hasTimingOverride = occState?.start != null || occState?.duration != null
  const movedFromOrigin = occState?.start != null && occState.start.slice(0, 10) !== date

  // ---- delete (scoped for a series) --------------------------------------

  /** Drop the whole series, every occurrence with it. */
  function deleteAllEvents() {
    writeEvent({ kind: 'removeEvent', id: event.id })
    onClose()
  }
  /** Remove just this slot: the rule still produces it, `cancelled` hides it. */
  function deleteThisEvent() {
    occurrences.mutate({
      accountId: accountId,
      change: { kind: 'cancel', series: timingOf(event), date },
    })
    onClose()
  }
  const deleteChoices: ScopeChoice[] = [
    { label: 'This event only', detail: isoLabel(date), onSelect: deleteThisEvent },
    { label: 'All events', detail: 'The whole series', onSelect: deleteAllEvents },
  ]

  /** Toolbar delete: actions only — the question itself lives in the sheet. */
  const deleteButton = (
    <button
      type="button"
      className={cx(shared.iconBtn, shared.iconDanger)}
      onClick={() => (isRecurring ? setDeleteScope(true) : setConfirmDelete(true))}
      aria-label="Delete event"
    >
      <Trash2 size={20} aria-hidden />
    </button>
  )

  // Show this occurrence's *effective* timing — a one-off override moves the time
  // and length for this date only, while `event` stays the series for editing.
  const eff = effectiveOccurrence(event, date, completions)
  const startMin = eventStartMinutes(eff)
  const endMin = startMin + eff.duration
  const span = eventSpanDays(eff)
  const timeLabel = eff.allDay
    ? span > 1
      ? `All day · ${span} days`
      : 'All day'
    : `${minutesToTime(startMin)}–${minutesToTime(endMin % MINS_PER_DAY)}${span > 1 ? ` (+${span - 1}d)` : ''}`

  // For a checklist event, "done" is derived from ticks — only skipped/blocked
  // are set explicitly. Otherwise all three statuses are selectable.

  // Cold window (e.g. a deep search jump): hold the interactive body until the
  // occurrence's real ticks/status are in, so a tap can't act on bare defaults.
  if (isLoading) {
    return (
      <div className={shared.editorPage}>
        <header className={shared.editorHead}>
          <button type="button" className={shared.editorCancel} onClick={onClose}>
            Close
          </button>
          <div className={shared.editorActions}>
            <button type="button" className={shared.primary} onClick={onEdit}>
              Edit
            </button>
          </div>
        </header>
        <div className={shared.editorBody}>
          <h1 className={shared.editorTitle}>{event.title}</h1>
          <PageLoader />
        </div>
      </div>
    )
  }

  return (
    <div className={shared.editorPage}>
      <header className={shared.editorHead}>
        <button type="button" className={shared.editorCancel} onClick={onClose}>
          Close
        </button>
        <div className={shared.editorActions}>
          {deleteButton}
          <button type="button" className={shared.primary} onClick={onEdit}>
            Edit
          </button>
        </div>
      </header>

      <div className={shared.editorBody}>
        <h1 className={cx(shared.editorTitle, done && s.doneTitle)}>{event.title}</h1>

        <p className={s.meta}>
          {timeLabel} · {attendeeLabelFor(event.attendees)(people)}
          {event.recurrence && ` · ${recurrenceLabel(event.recurrence).toLowerCase()}`}
        </p>

        {hasTimingOverride && (
          <p className={s.moved}>
            {movedFromOrigin
              ? `Moved from ${isoLabel(date)} — still part of this series`
              : 'Rescheduled for this occurrence only'}
            {' · '}
            <button
              type="button"
              className={s.resetOverride}
              onClick={() =>
                occurrences.mutate({
                  accountId: accountId,
                  change: { kind: 'clearOverride', series: timingOf(event), date },
                })
              }
            >
              Reset to series time
            </button>
          </p>
        )}

        {hasChecklist &&
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
                          occurrences.mutate({
                            accountId: accountId,
                            change: {
                              kind: 'tick',
                              series: timingOf(event),
                              date,
                              entryId: it.id,
                              checked: !checked[it.id],
                            },
                          })
                        }
                      />
                      <span className={cx(checked[it.id] && s.doneTitle)}>{it.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

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

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete event?"
        message={`“${event.title || 'Untitled'}” will be removed from your calendar.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteAllEvents}
      />

      <ScopeSheet
        open={deleteScope}
        onOpenChange={setDeleteScope}
        title="Delete recurring event"
        choices={deleteChoices}
        destructive
      />
    </div>
  )
}
