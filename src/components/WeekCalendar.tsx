import { useState } from 'react'
import { useApp } from '../state'
import { DAY_NAMES, addDays, dayLabel, minutesToTime, weekRangeLabel } from '../lib/dates'
import { occurrencesOnDate, recurrenceLabel } from '../lib/recurrence'
import { attendeeLabel, eventColor } from '../lib/people'
import { active } from '../lib/sync'
import { EventEditor, type EditorTarget } from './EventEditor'

export function WeekCalendar() {
  const { state, dispatch } = useApp()
  const [target, setTarget] = useState<EditorTarget | null>(null)
  const members = active(state.members)
  const events = active(state.events)
  const defaultAttendees = members[0] ? [members[0].id] : []

  return (
    <section className="view">
      <div className="view-head">
        <div className="week-nav">
          <button onClick={() => dispatch({ type: 'shiftWeek', delta: -1 })} aria-label="Previous week">
            ‹
          </button>
          <strong>{weekRangeLabel(state.weekStart)}</strong>
          <button onClick={() => dispatch({ type: 'shiftWeek', delta: 1 })} aria-label="Next week">
            ›
          </button>
        </div>
      </div>

      <div className="view-body">
        <div className="days">
        {DAY_NAMES.map((_, dayIdx) => {
          const dateISO = addDays(state.weekStart, dayIdx)
          // All-day items first, then timed by start.
          const occs = occurrencesOnDate(events, dateISO).sort((a, b) => {
            if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1
            return a.event.start - b.event.start
          })
          return (
            <div className="day-col" key={dayIdx}>
              <div className="day-head">{dayLabel(state.weekStart, dayIdx)}</div>

              <div className="event-list">
                {occs.length === 0 && <p className="empty">No plans</p>}
                {occs.map((o) => {
                  const e = o.event
                  const color = eventColor(members, e.attendees)
                  return (
                    <div key={e.id} className="event" style={{ borderLeftColor: color }}>
                      <div className="event-time">
                        {e.allDay
                          ? o.span > 1
                            ? `All day · ${o.offset + 1}/${o.span}`
                            : 'All day'
                          : `${minutesToTime(e.start)}–${minutesToTime(e.end)}`}
                      </div>
                      <button
                        className="event-body"
                        onClick={() => setTarget({ mode: 'edit', event: e })}
                      >
                        <span className="event-title">{e.title}</span>
                        <span className="event-meta" style={{ color }}>
                          {attendeeLabel(members, e.attendees)}
                          {e.recurrence && ` · ${recurrenceLabel(e.recurrence).toLowerCase()}`}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                className="add-link"
                onClick={() => setTarget({ mode: 'new', date: dateISO, attendees: defaultAttendees })}
              >
                + Add
              </button>
            </div>
          )
        })}
        </div>
      </div>

      {target && <EventEditor target={target} onClose={() => setTarget(null)} />}
    </section>
  )
}
