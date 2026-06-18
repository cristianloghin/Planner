import { useState } from 'react'
import { useApp } from '../state'
import { DAY_NAMES, addDays, dayLabel, minutesToTime, weekRangeLabel } from '../lib/dates'
import { occurrencesOnDate, recurrenceLabel } from '../lib/recurrence'
import { attendeeLabel, eventColor } from '../lib/people'
import { EventEditor, type EditorTarget } from './EventEditor'
import shared from '../styles/shared.module.css'
import s from './WeekCalendar.module.css'

export function WeekCalendar() {
  const { state, dispatch } = useApp()
  const [target, setTarget] = useState<EditorTarget | null>(null)

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.weekNav}>
          <button onClick={() => dispatch({ type: 'shiftWeek', delta: -1 })} aria-label="Previous week">
            ‹
          </button>
          <strong>{weekRangeLabel(state.weekStart)}</strong>
          <button onClick={() => dispatch({ type: 'shiftWeek', delta: 1 })} aria-label="Next week">
            ›
          </button>
        </div>
      </div>

      <div className={shared.viewBody}>
        <div className={s.days}>
        {DAY_NAMES.map((_, dayIdx) => {
          const dateISO = addDays(state.weekStart, dayIdx)
          // All-day items first, then timed by start.
          const occs = occurrencesOnDate(state.events, dateISO).sort((a, b) => {
            if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1
            return a.event.start - b.event.start
          })
          return (
            <div className={s.dayCol} key={dayIdx}>
              <div className={s.dayHead}>{dayLabel(state.weekStart, dayIdx)}</div>

              <div className={s.eventList}>
                {occs.length === 0 && <p className={shared.empty}>No plans</p>}
                {occs.map((o) => {
                  const e = o.event
                  const color = eventColor(state, e.attendees)
                  return (
                    <div key={e.id} className={s.event} style={{ borderLeftColor: color }}>
                      <div className={s.eventTime}>
                        {e.allDay
                          ? o.span > 1
                            ? `All day · ${o.offset + 1}/${o.span}`
                            : 'All day'
                          : `${minutesToTime(e.start)}–${minutesToTime(e.end)}`}
                      </div>
                      <button
                        className={s.eventBody}
                        onClick={() => setTarget({ mode: 'edit', event: e })}
                      >
                        <span className={s.eventTitle}>{e.title}</span>
                        <span className={s.eventMeta} style={{ color }}>
                          {attendeeLabel(state, e.attendees)}
                          {e.recurrence && ` · ${recurrenceLabel(e.recurrence).toLowerCase()}`}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                className={s.addLink}
                onClick={() => setTarget({ mode: 'new', date: dateISO, attendees: ['me'] })}
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
