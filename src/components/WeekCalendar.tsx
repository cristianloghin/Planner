import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCompletionsForRange } from '../data/completions'
import { DAY_NAMES, addDays, dayLabel, minutesToTime, mondayOf, weekRangeLabel } from '../lib/dates'
import { colorStyle } from '../lib/palette'
import { defaultAttendees, eventColorKey } from '../lib/people'
import { nextRelevantDate, occurrencesOnDate, recurrenceLabel } from '../lib/recurrence'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import { Avatars } from './Avatars'
import { type EditorTarget, EventEditor } from './EventEditor'
import { LoadingPill } from './Spinner'
import { ViewHeader } from './ViewHeader'
import s from './WeekCalendar.module.css'

export function WeekCalendar() {
  const { state, dispatch } = useApp()
  const [target, setTarget] = useState<EditorTarget | null>(null)

  // Windowed per-occurrence state covering the visible week.
  const weekEnd = addDays(state.weekStart, 6)
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    state.weekStart,
    weekEnd,
  )

  // Expand the week's occurrences once per data/week change, not per render.
  const weekDays = useMemo(
    () =>
      DAY_NAMES.map((_, dayIdx) => {
        const dateISO = addDays(state.weekStart, dayIdx)
        // All-day items first, then timed by start.
        const occs = occurrencesOnDate(state.events, dateISO, completions).sort((a, b) => {
          if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1
          return a.segment.start - b.segment.start
        })
        return { dateISO, occs }
      }),
    [state.weekStart, state.events, completions],
  )

  // Open a search hit: jump the week to its next upcoming occurrence (falling
  // back to the series anchor for an ended series) and open the editor there.
  function openEvent(seriesId: string) {
    const event = state.events.find((e) => e.id === seriesId)
    if (!event) return
    const date = nextRelevantDate(event)
    dispatch({ type: 'setWeek', weekStart: mondayOf(new Date(`${date}T00:00:00`)) })
    setTarget({ mode: 'edit', event, occurrenceDate: date })
  }

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={() => dispatch({ type: 'setWeek', weekStart: mondayOf(new Date()) })}
        todayActive={state.weekStart === mondayOf(new Date())}
        onPickSearch={openEvent}
        nav={
          <div className={shared.weekNav}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'shiftWeek', delta: -1 })}
              aria-label="Previous week"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{weekRangeLabel(state.weekStart)}</strong>
            <button
              type="button"
              onClick={() => dispatch({ type: 'shiftWeek', delta: 1 })}
              aria-label="Next week"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      />

      <div className={shared.viewBody}>
        <div className={s.days}>
          {weekDays.map(({ dateISO, occs }, dayIdx) => {
            return (
              <div className={s.dayCol} key={dateISO}>
                <div className={s.dayHead}>{dayLabel(state.weekStart, dayIdx)}</div>

                <div className={s.eventList}>
                  {occs.length === 0 && <p className={shared.empty}>No plans</p>}
                  {occs.map((o) => {
                    const e = o.event
                    return (
                      <div
                        key={`${e.id}:${o.start}`}
                        className={s.event}
                        style={colorStyle(eventColorKey(state, e.attendees[0], e))}
                      >
                        <div className={s.eventTime}>
                          {e.allDay
                            ? o.span > 1
                              ? `All day · ${o.offset + 1}/${o.span}`
                              : 'All day'
                            : `${minutesToTime(o.segment.start)}–${minutesToTime(o.segment.end)}`}
                          {o.moved && ' · ↔ moved'}
                        </div>
                        <button
                          type="button"
                          className={s.eventBody}
                          onClick={() =>
                            setTarget({
                              mode: 'edit',
                              event: e,
                              occurrenceDate: o.start,
                            })
                          }
                        >
                          <span className={s.eventTitle}>{e.title}</span>
                          <span className={s.eventMeta}>
                            <Avatars attendees={e.attendees} />
                            {e.recurrence && recurrenceLabel(e.recurrence).toLowerCase()}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>

                <button
                  type="button"
                  className={s.addLink}
                  onClick={() =>
                    setTarget({
                      mode: 'new',
                      date: dateISO,
                      attendees: defaultAttendees(state),
                    })
                  }
                >
                  + Add
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {completionsLoading && <LoadingPill />}

      {target && <EventEditor target={target} onClose={() => setTarget(null)} />}
    </section>
  )
}
