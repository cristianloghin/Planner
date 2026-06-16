import { useState } from 'react'
import { useApp } from '../state'
import type { Attendee, CalendarEvent } from '../types'
import { DAY_NAMES, dayLabel, minutesToTime, timeToMinutes, weekRangeLabel } from '../lib/dates'
import { attendeeColor, attendeeName } from '../lib/people'

export function WeekCalendar() {
  const { state, dispatch } = useApp()
  const [adding, setAdding] = useState<number | null>(null)

  return (
    <section>
      <div className="week-nav">
        <button onClick={() => dispatch({ type: 'shiftWeek', delta: -1 })} aria-label="Previous week">
          ‹
        </button>
        <strong>{weekRangeLabel(state.weekStart)}</strong>
        <button onClick={() => dispatch({ type: 'shiftWeek', delta: 1 })} aria-label="Next week">
          ›
        </button>
      </div>

      <div className="days">
        {DAY_NAMES.map((_, dayIdx) => {
          const events = state.events
            .filter((e) => e.day === dayIdx)
            .sort((a, b) => a.start - b.start)
          return (
            <div className="day-col" key={dayIdx}>
              <div className="day-head">{dayLabel(state.weekStart, dayIdx)}</div>

              <div className="event-list">
                {events.length === 0 && <p className="empty">No plans</p>}
                {events.map((e) => {
                  const color = attendeeColor(state, e.personId)
                  return (
                    <div
                      key={e.id}
                      className="event"
                      style={{ borderLeftColor: color }}
                    >
                      <div className="event-time">
                        {minutesToTime(e.start)}–{minutesToTime(e.end)}
                      </div>
                      <div className="event-title">{e.title}</div>
                      <div className="event-meta" style={{ color }}>
                        {attendeeName(state, e.personId)}
                      </div>
                      <button
                        className="event-del"
                        aria-label="Delete event"
                        onClick={() => dispatch({ type: 'removeEvent', id: e.id })}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>

              {adding === dayIdx ? (
                <EventForm day={dayIdx} onDone={() => setAdding(null)} />
              ) : (
                <button className="add-link" onClick={() => setAdding(dayIdx)}>
                  + Add
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EventForm({ day, onDone }: { day: number; onDone: () => void }) {
  const { state, dispatch } = useApp()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [personId, setPersonId] = useState<Attendee>('me')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const ev: Omit<CalendarEvent, 'id'> = {
      title: title.trim(),
      day,
      start: timeToMinutes(start),
      end: timeToMinutes(end),
      personId,
    }
    dispatch({ type: 'addEvent', event: ev })
    onDone()
  }

  return (
    <form className="event-form" onSubmit={submit}>
      <input
        autoFocus
        placeholder="What's the plan?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="row">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <select value={personId} onChange={(e) => setPersonId(e.target.value as Attendee)}>
        {Object.values(state.people).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="both">Both (shared)</option>
      </select>
      <div className="row">
        <button type="submit" className="primary">
          Add
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
