import { useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, Person, PersonId } from '../types'
import { dayLabel, minutesToTime, timeToMinutes } from '../lib/dates'

export function DayView() {
  const { state, dispatch } = useApp()
  const day = state.selectedDay
  const people = Object.values(state.people)

  return (
    <section className="day-view">
      <div className="week-nav">
        <button onClick={() => dispatch({ type: 'shiftDay', delta: -1 })} aria-label="Previous day">
          ‹
        </button>
        <strong>{dayLabel(state.weekStart, day)}</strong>
        <button onClick={() => dispatch({ type: 'shiftDay', delta: 1 })} aria-label="Next day">
          ›
        </button>
      </div>

      <div className="day-columns">
        {people.map((person) => (
          <PersonColumn key={person.id} person={person} day={day} />
        ))}
      </div>
    </section>
  )
}

function PersonColumn({ person, day }: { person: Person; day: number }) {
  const { state, dispatch } = useApp()
  const [adding, setAdding] = useState(false)

  const events = state.events
    .filter((e) => e.day === day && e.personId === person.id)
    .sort((a, b) => a.start - b.start)

  return (
    <div className="person-col" style={{ borderTopColor: person.color }}>
      <div className="person-col-head" style={{ color: person.color }}>
        <span className="dot" style={{ background: person.color }} />
        {person.name}
      </div>

      <div className="event-list">
        {events.length === 0 && <p className="empty">Nothing planned</p>}
        {events.map((e) => (
          <div key={e.id} className="event" style={{ borderLeftColor: person.color }}>
            <div className="event-time">
              {minutesToTime(e.start)}–{minutesToTime(e.end)}
            </div>
            <div className="event-title">{e.title}</div>
            {e.notes && <div className="event-notes">{e.notes}</div>}
            <button
              className="event-del"
              aria-label="Delete event"
              onClick={() => dispatch({ type: 'removeEvent', id: e.id })}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <DayEventForm day={day} personId={person.id} onDone={() => setAdding(false)} />
      ) : (
        <button className="add-link" onClick={() => setAdding(true)}>
          + Add
        </button>
      )}
    </div>
  )
}

function DayEventForm({
  day,
  personId,
  onDone,
}: {
  day: number
  personId: PersonId
  onDone: () => void
}) {
  const { dispatch } = useApp()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')

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
