import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, MemberId, RecurrenceFreq } from '../types'
import { minutesToTime, timeToMinutes } from '../lib/dates'
import { REMINDER_OFFSETS, offsetLabel } from '../lib/notifications'
import { AttendeeChips } from './AttendeeChips'

const SNAP = 15

/** What the editor opens onto: a brand-new event or an existing one. */
export type EditorTarget =
  | { mode: 'new'; date: string; attendees: MemberId[]; start?: number; end?: number }
  | { mode: 'edit'; event: CalendarEvent }

type RepeatChoice = 'none' | RecurrenceFreq

/** Shared modal for creating and editing events (timed, all-day, recurring). */
export function EventEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const { dispatch } = useApp()
  const isEdit = target.mode === 'edit'
  const base = isEdit ? target.event : null

  const [title, setTitle] = useState(base?.title ?? '')
  const [date, setDate] = useState(isEdit ? base!.date : target.date)
  const [allDay, setAllDay] = useState(base?.allDay ?? false)
  const [start, setStart] = useState(
    minutesToTime(isEdit ? base!.start : (target.start ?? 9 * 60)),
  )
  const [end, setEnd] = useState(minutesToTime(isEdit ? base!.end : (target.end ?? 10 * 60)))
  const [days, setDays] = useState(base?.days ?? 1)
  const [attendees, setAttendees] = useState<MemberId[]>(
    isEdit ? base!.attendees : target.attendees,
  )
  const [repeat, setRepeat] = useState<RepeatChoice>(base?.recurrence?.freq ?? 'none')
  const [interval, setInterval] = useState(base?.recurrence?.interval ?? 1)
  const [reminders, setReminders] = useState<number[]>(base?.reminders ?? [])

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  function toggleReminder(offset: number) {
    setReminders((prev) =>
      prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset],
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const s = timeToMinutes(start)
    const en = Math.max(timeToMinutes(end), s + SNAP)
    const fields = {
      title: title.trim(),
      date,
      allDay,
      start: allDay ? 0 : s,
      end: allDay ? 0 : en,
      days: allDay ? Math.max(1, days) : 1,
      recurrence: repeat === 'none' ? undefined : { freq: repeat, interval: Math.max(1, interval) },
      attendees,
      reminders: reminders.length ? [...reminders].sort((a, b) => a - b) : undefined,
    }
    if (isEdit) {
      dispatch({ type: 'updateEvent', event: { ...base!, ...fields } })
    } else {
      dispatch({ type: 'addEvent', event: fields })
    }
    onClose()
  }

  const unitLabel = repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'

  return (
    <form className="editor-page" onSubmit={submit}>
      <header className="editor-head">
        <button type="button" className="editor-cancel" onClick={onClose}>
          Cancel
        </button>
        <strong>{isEdit ? 'Edit event' : 'New event'}</strong>
        <button type="submit" className="primary">
          Save
        </button>
      </header>

      <div className="editor-body">
        <input
          ref={titleRef}
          placeholder="What's the plan?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="toggle">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All-day
        </label>

        {allDay ? (
          <label className="field">
            Spans (days)
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        ) : (
          <div className="row">
            <label className="field">
              From
              <input type="time" step={SNAP * 60} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              To
              <input type="time" step={SNAP * 60} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}

        <div className="row">
          <label className="field">
            Repeats
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {repeat !== 'none' && (
            <label className="field">
              Every
              <div className="interval">
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))}
                />
                <span>{unitLabel}</span>
              </div>
            </label>
          )}
        </div>

        <label className="field">Who's involved?</label>
        <AttendeeChips value={attendees} onChange={setAttendees} />

        <label className="field">Remind me</label>
        <div className="chips">
          {REMINDER_OFFSETS.map((o) => {
            const on = reminders.includes(o)
            return (
              <button
                type="button"
                key={o}
                className={on ? 'chip on' : 'chip'}
                style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                onClick={() => toggleReminder(o)}
              >
                {offsetLabel(o)}
              </button>
            )
          })}
        </div>

        {isEdit && (
          <button
            type="button"
            className="danger editor-delete"
            onClick={() => {
              dispatch({ type: 'removeEvent', id: base!.id })
              onClose()
            }}
          >
            Delete event
          </button>
        )}
      </div>
    </form>
  )
}
