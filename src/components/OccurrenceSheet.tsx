import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '../account'
import shared from '../assets/styles/shared.module.css'
import { ConfirmDialog } from '../assets/ui/ConfirmDialog'
import { type ScopeChoice, ScopeSheet } from '../assets/ui/ScopeSheet'
import { PageLoader } from '../assets/ui/Spinner'
import { cx } from '../assets/utils/cx'
import { isoLabel, minutesToTime, offsetLabel } from '../assets/utils/dates'
import { type EventsChange, useEventsWrite, useOccurrencesWrite } from '../domains/events/mutations'
import { useOccurrencesForRange } from '../domains/events/queries'
import { reminderOffsets, timingOf } from '../domains/events/selectors'
import { usePeopleWithColors } from '../domains/people/queries'
import { attendeeLabelFor } from '../domains/people/selectors'
import { effectiveOccurrence, recurrenceLabel } from '../services/recurrence/expand'
import {
  MINS_PER_DAY,
  eventSpanDays,
  eventStartMinutes,
} from '../services/recurrence/timing'
import type { CalendarEvent } from '../types'
import { AttendeeChips } from '../domains/people/components/AttendeeChips'
import { EditorPageView } from '../views/EditorPage'
import s from './OccurrenceSheet.module.css'

/**
 * A single occurrence of an event on a date: the place to move, cancel or
 * delete the day. Editing the *series* hands off to the EventEditor.
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
  const { people, withColors: peopleWithColors } = usePeopleWithColors(accountId, userId)
  const eventsWrite = useEventsWrite()
  const writeEvent = (change: EventsChange) =>
    eventsWrite.mutate({
      accountId: accountId,
      userId: userId,
      change,
    })
  const { occurrences, isLoading } = useOccurrencesForRange(accountId, date, date)
  const occurrencesWrite = useOccurrencesWrite()

  // Delete asks two different questions. A one-off just needs confirming; a
  // series needs to know how far the delete reaches, and that action sheet is
  // itself the confirmation (so the two are mutually exclusive, never stacked).
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteScope, setDeleteScope] = useState(false)
  const isRecurring = !!event.recurrence

  const occState = occurrences.on(event.id, date)
  // A one-off override on this slot. `date` is the occurrence's identity (the day
  // the series would normally place it); if the override's start lands on another
  // day, it's been moved there.
  const hasTimingOverride = occState?.start != null || occState?.duration != null
  // Who is on it today: this day's own list when it has one, else the series'.
  const attendees = occState?.attendees ?? event.attendees
  const hasPeopleOverride = occState?.attendees != null
  const movedFromOrigin = occState?.start != null && occState.start.slice(0, 10) !== date

  // ---- delete (scoped for a series) --------------------------------------

  /** Drop the whole series, every occurrence with it. */
  function deleteAllEvents() {
    writeEvent({ kind: 'removeEvent', id: event.id })
    onClose()
  }
  /** Remove just this slot: the rule still produces it, `cancelled` hides it. */
  function deleteThisEvent() {
    occurrencesWrite.mutate({
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
  const eff = effectiveOccurrence(event, date, occurrences)
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
      <EditorPageView cancelLabel="Close" onCancel={onClose}>
        <EditorPageView.Title>{null}</EditorPageView.Title>
        <EditorPageView.Actions>
          <button type="button" className={shared.primary} onClick={onEdit}>
            Edit
          </button>
        </EditorPageView.Actions>
        <EditorPageView.Body>
          <h1 className={shared.editorTitle}>{event.title}</h1>
          <PageLoader />
        </EditorPageView.Body>
      </EditorPageView>
    )
  }

  return (
    <>
      <EditorPageView cancelLabel="Close" onCancel={onClose}>
        <EditorPageView.Title>{null}</EditorPageView.Title>
        <EditorPageView.Actions>
          {deleteButton}
          <button type="button" className={shared.primary} onClick={onEdit}>
            Edit
          </button>
        </EditorPageView.Actions>
        <EditorPageView.Body>
        <h1 className={shared.editorTitle}>{event.title}</h1>

        <p className={s.meta}>
          {timeLabel} · {attendeeLabelFor(attendees)(people)}
          {event.recurrence && ` · ${recurrenceLabel(event).toLowerCase()}`}
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
                occurrencesWrite.mutate({
                  accountId: accountId,
                  change: { kind: 'clearOverride', series: timingOf(event), date },
                })
              }
            >
              Reset to series time
            </button>
          </p>
        )}

        <label className={shared.label}>Who's involved?</label>
        <AttendeeChips
          people={peopleWithColors}
          value={attendees}
          onChange={(next) =>
            occurrencesWrite.mutate({
              accountId: accountId,
              change: { kind: 'attendees', series: timingOf(event), date, attendees: next },
            })
          }
        />
        {hasPeopleOverride && (
          <p className={s.moved}>
            Just these people on this day
            {' · '}
            <button
              type="button"
              className={s.resetOverride}
              onClick={() =>
                occurrencesWrite.mutate({
                  accountId: accountId,
                  change: { kind: 'clearAttendees', series: timingOf(event), date },
                })
              }
            >
              Reset to series people
            </button>
          </p>
        )}

        {reminderOffsets(event).length > 0 && (
          <div className={s.reminders}>
            {reminderOffsets(event).map((o) => (
              <span key={o} className={s.reminderChip}>
                🔔 {offsetLabel(o)}
              </span>
            ))}
          </div>
        )}
        </EditorPageView.Body>
      </EditorPageView>

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
    </>
  )
}
