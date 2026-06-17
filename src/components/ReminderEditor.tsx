import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { Reminder } from '../types'
import { minutesToTime, timeToMinutes } from '../lib/dates'

/** Opens onto a new standalone reminder or an existing one. */
export type ReminderTarget =
  | { mode: 'new'; date: string }
  | { mode: 'edit'; reminder: Reminder }

/** Full-page editor for standalone in-app notifications. */
export function ReminderEditor({ target, onClose }: { target: ReminderTarget; onClose: () => void }) {
  const { dispatch } = useApp()
  const isEdit = target.mode === 'edit'
  const base = isEdit ? target.reminder : null

  const [title, setTitle] = useState(base?.title ?? '')
  const [date, setDate] = useState(isEdit ? base!.date : target.date)
  const [time, setTime] = useState(minutesToTime(isEdit ? base!.time : 9 * 60))
  const [daily, setDaily] = useState(base?.repeat === 'daily')

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const fields = {
      title: title.trim(),
      date,
      time: timeToMinutes(time),
      repeat: daily ? ('daily' as const) : ('none' as const),
    }
    if (isEdit) {
      dispatch({ type: 'updateReminder', reminder: { ...base!, ...fields } })
    } else {
      dispatch({ type: 'addReminder', reminder: fields })
    }
    onClose()
  }

  return (
    <form className="editor-page" onSubmit={submit}>
      <header className="editor-head">
        <button type="button" className="editor-cancel" onClick={onClose}>
          Cancel
        </button>
        <strong>{isEdit ? 'Edit reminder' : 'New reminder'}</strong>
        <button type="submit" className="primary">
          Save
        </button>
      </header>

      <div className="editor-body">
        <input
          ref={titleRef}
          placeholder="Remind me to…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="row">
          <label className="field">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          Repeat daily
        </label>

        {isEdit && (
          <button
            type="button"
            className="danger editor-delete"
            onClick={() => {
              dispatch({ type: 'removeReminder', id: base!.id })
              onClose()
            }}
          >
            Delete reminder
          </button>
        )}
      </div>
    </form>
  )
}
