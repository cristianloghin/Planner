import { useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, OccurrenceStatusCode } from '../types'
import { addDays, isoLabel, minutesToTime } from '../lib/dates'
import { eventStartMinutes, eventSpanDays, MINS_PER_DAY } from '../lib/timing'
import { attendeeLabel } from '../lib/people'
import { checklists, notes, reminderOffsets } from '../lib/attachments'
import {
  blockingPrerequisites,
  isOccurrenceDone,
  occKey,
  occurrenceEffectiveStatus,
} from '../lib/occurrences'
import { offsetLabel } from '../lib/notifications'
import { effectiveOccurrence, recurrenceLabel, seriesOccurrenceDatesInRange } from '../lib/recurrence'
import { findListItem, isOverdue } from '../lib/lists'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import s from './OccurrenceSheet.module.css'

const STATUSES: OccurrenceStatusCode[] = ['done', 'skipped', 'blocked']

/**
 * A single occurrence of an event on a date: the place to tick it off, work its
 * checklist, set its status, and manage what it waits on. Editing the *template*
 * hands off to the EventEditor.
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
  const occState = state.completions[occKey(event.id, date)]
  const checked = occState?.checked ?? {}
  const status = occState?.status
  const blockers = blockingPrerequisites(state, event, date)
  // A one-off override on this slot. `date` is the occurrence's identity (the day
  // the series would normally place it); if the override's start lands on another
  // day, it's been moved there.
  const hasTimingOverride = occState?.start != null || occState?.duration != null
  const movedFromOrigin = occState?.start != null && occState.start.slice(0, 10) !== date

  function setStatus(next: OccurrenceStatusCode | null) {
    dispatch({ type: 'setOccurrenceStatus', eventId: event.id, date, status: next })
  }

  // Show this occurrence's *effective* timing — a one-off override moves the time
  // and length for this date only, while `event` stays the series for editing.
  const eff = effectiveOccurrence(event, date, state.completions)
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
  const statusOptions = hasChecklist ? STATUSES.filter((o) => o !== 'done') : STATUSES

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

        {hasTimingOverride && (
          <p className={s.moved}>
            {movedFromOrigin
              ? `Moved from ${isoLabel(date)} — still part of this series`
              : 'Rescheduled for this occurrence only'}
            {' · '}
            <button
              type="button"
              className={s.resetOverride}
              onClick={() => dispatch({ type: 'clearOccurrenceOverride', eventId: event.id, date })}
            >
              Reset to series time
            </button>
          </p>
        )}

        {blockers.length > 0 && (
          <p className={s.waiting}>
            ⏳ Waiting on{' '}
            {blockers
              .map((b) => `${b.event.title} (${isoLabel(b.date)}) — needs ${b.requiredStatus}`)
              .join(', ')}
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
                          dispatch({ type: 'toggleChecklistEntry', eventId: event.id, date, entryId: it.id })
                        }
                      />
                      <span className={cx(checked[it.id] && s.doneTitle)}>{it.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <div className={s.statusRow}>
          {statusOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={cx(s.statusBtn, status === opt && s.statusOn)}
              onClick={() => setStatus(status === opt ? null : opt)}
            >
              {opt === 'done' ? 'Mark done' : opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>

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

        <LinkedTodos event={event} date={date} />

        <DependencyEditor event={event} date={date} />
      </div>
    </div>
  )
}

/**
 * To-dos surfaced inside this occurrence (`list_item_event_link`). Each linked
 * to-do is a tickable line whose tick is the to-do's own `list_item.done` — so
 * ticking it here is the same write as in the Lists view (no per-occurrence
 * state). A linked to-do never gates the occurrence's completion.
 */
function LinkedTodos({ event, date }: { event: CalendarEvent; date: string }) {
  const { state, dispatch } = useApp()
  const linkedIds = state.listLinks[occKey(event.id, date)] ?? []
  const linked = linkedIds
    .map((id) => findListItem(state, id))
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const [pick, setPick] = useState('')

  // Items not already linked here, kept under their list as <optgroup>s.
  const groups = state.lists
    .map((list) => ({
      list,
      items: list.items.filter((i) => !linkedIds.includes(i.id)),
    }))
    .filter((g) => g.items.length > 0)

  function add() {
    if (!pick) return
    dispatch({ type: 'linkListItem', eventId: event.id, date, itemId: pick })
    setPick('')
  }

  return (
    <div className={s.deps}>
      <h4 className={s.depsTitle}>To-dos</h4>

      {linked.length > 0 && (
        <ul className={s.todoList}>
          {linked.map(({ list, item }) => (
            <li key={item.id} className={s.todoRow}>
              <label className={s.todoLabel}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() =>
                    dispatch({ type: 'toggleListItem', listId: list.id, itemId: item.id })
                  }
                />
                <span className={cx(item.done && s.doneTitle)}>{item.title}</span>
              </label>
              {item.dueOn && (
                <span className={cx(s.todoDue, isOverdue(item) && s.todoOverdue)}>
                  {isoLabel(item.dueOn)}
                </span>
              )}
              <button
                type="button"
                className={s.depRemove}
                onClick={() =>
                  dispatch({ type: 'unlinkListItem', eventId: event.id, date, itemId: item.id })
                }
                aria-label="Unlink to-do"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {groups.length > 0 ? (
        <div className={s.depForm}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Link a to-do">
            <option value="">Link a to-do…</option>
            {groups.map(({ list, items }) => (
              <optgroup key={list.id} label={list.title}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" className={shared.primary} onClick={add} disabled={!pick}>
            Link
          </button>
        </div>
      ) : (
        linked.length === 0 && <p className={s.meta}>No to-dos to link yet.</p>
      )}
    </div>
  )
}

/**
 * Manage this occurrence's prerequisite links — concrete occurrence→occurrence
 * edges. Each link names another event, one of its real occurrences, and the
 * status that occurrence must reach.
 */
function DependencyEditor({ event, date }: { event: CalendarEvent; date: string }) {
  const { state, dispatch } = useApp()
  const edges = state.dependencies[occKey(event.id, date)] ?? []
  const others = state.events.filter((e) => e.id !== event.id)

  const [prereqId, setPrereqId] = useState('')
  const [prereqDate, setPrereqDate] = useState('')
  const [requiredStatus, setRequiredStatus] = useState<OccurrenceStatusCode>('done')

  const prereq = others.find((e) => e.id === prereqId)
  // Bound the occurrence search to a year either side of this occurrence so a
  // recurring prerequisite yields a finite, relevant list of real slots.
  const prereqDates = prereq
    ? seriesOccurrenceDatesInRange(prereq, addDays(date, -365), addDays(date, 365))
    : []

  function add() {
    if (!prereqId || !prereqDate) return
    dispatch({
      type: 'addDependency',
      eventId: event.id,
      date,
      prerequisiteSeriesId: prereqId,
      prerequisiteDate: prereqDate,
      requiredStatus,
    })
    setPrereqId('')
    setPrereqDate('')
    setRequiredStatus('done')
  }

  return (
    <div className={s.deps}>
      <h4 className={s.depsTitle}>Waits on</h4>

      {edges.length > 0 && (
        <ul className={s.depList}>
          {edges.map((edge) => {
            const dep = state.events.find((e) => e.id === edge.prerequisiteSeriesId)
            const actual = dep ? occurrenceEffectiveStatus(state, dep, edge.prerequisiteDate) : null
            const met = actual === edge.requiredStatus
            return (
              <li key={`${edge.prerequisiteSeriesId}:${edge.prerequisiteDate}`} className={s.depRow}>
                <span className={cx(s.depDot, met ? s.depMet : s.depUnmet)} />
                <span className={s.depText}>
                  {dep?.title ?? 'Unknown'} · {isoLabel(edge.prerequisiteDate)} · needs {edge.requiredStatus}
                </span>
                <button
                  type="button"
                  className={s.depRemove}
                  onClick={() =>
                    dispatch({
                      type: 'removeDependency',
                      eventId: event.id,
                      date,
                      prerequisiteSeriesId: edge.prerequisiteSeriesId,
                      prerequisiteDate: edge.prerequisiteDate,
                    })
                  }
                  aria-label="Remove link"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {others.length > 0 ? (
        <div className={s.depForm}>
          <select
            value={prereqId}
            onChange={(e) => {
              setPrereqId(e.target.value)
              setPrereqDate('')
            }}
            aria-label="Prerequisite event"
          >
            <option value="">Add a prerequisite…</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title || 'Untitled'}
              </option>
            ))}
          </select>

          {prereq && (
            <>
              <select
                value={prereqDate}
                onChange={(e) => setPrereqDate(e.target.value)}
                aria-label="Prerequisite occurrence"
              >
                <option value="">Which occurrence…</option>
                {prereqDates.map((d) => (
                  <option key={d} value={d}>
                    {isoLabel(d)}
                  </option>
                ))}
              </select>

              <select
                value={requiredStatus}
                onChange={(e) => setRequiredStatus(e.target.value as OccurrenceStatusCode)}
                aria-label="Required status"
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    needs {st}
                  </option>
                ))}
              </select>

              <button type="button" className={shared.primary} onClick={add} disabled={!prereqDate}>
                Add
              </button>
            </>
          )}
        </div>
      ) : (
        <p className={s.meta}>No other events to wait on yet.</p>
      )}
    </div>
  )
}
