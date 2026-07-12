import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCompletionsForRange } from '../data/completions'
import { DAY_NAMES, addDays, dayLabel, minutesToTime, mondayOf, weekRangeLabel } from '../lib/dates'
import { colorStyle } from '../lib/palette'
import { defaultAttendees, eventColorKey } from '../lib/people'
import {
  type DayOccurrence,
  nextRelevantDate,
  occurrencesOnDate,
  recurrenceLabel,
} from '../lib/recurrence'
import { DAY_MIN } from '../lib/timelineLayout'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type { CalendarEvent } from '../types'
import { Avatars } from './Avatars'
import { type EditorTarget, EventEditor } from './EventEditor'
import { OccurrenceSheet } from './OccurrenceSheet'
import { LoadingPill } from './Spinner'
import { ViewHeader } from './ViewHeader'
import s from './WeekCalendar.module.css'
import { WeekTimelineBody, WeekTimelineHead } from './WeekTimeline'

const SNAP = 15

export function WeekCalendar() {
  const { state, dispatch } = useApp()
  const [target, setTarget] = useState<EditorTarget | null>(null)
  const [sheet, setSheet] = useState<{ event: CalendarEvent; date: string } | null>(null)
  const timeline = (state.preferences.weekLayout ?? 'list') === 'timeline'

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

  // Timeline interactions mirror the Day view: tap a bar for its occurrence
  // sheet, tap empty grid to add an event at that (snapped) time.
  function openSheet(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start })
  }

  function addAt(dateISO: string, minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setTarget({
      mode: 'new',
      date: dateISO,
      attendees: defaultAttendees(state),
      startMin: start,
      endMin: Math.min(start + 60, DAY_MIN),
    })
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
      >
        {timeline && (
          <WeekTimelineHead weekDays={weekDays} completions={completions} onOpen={openSheet} />
        )}
      </ViewHeader>

      {timeline ? (
        <WeekTimelineBody
          weekDays={weekDays}
          completions={completions}
          onOpen={openSheet}
          onAddAt={addAt}
        />
      ) : (
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
      )}

      {completionsLoading && <LoadingPill />}

      {target && <EventEditor target={target} onClose={() => setTarget(null)} />}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setTarget({ mode: 'edit', event: sheet.event, occurrenceDate: sheet.date })
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}
