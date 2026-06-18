import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, Person, PersonId } from '../types'
import { addDays, isoLabel, minutesToTime, toISODate } from '../lib/dates'
import { occurrencesOnDate, type DayOccurrence } from '../lib/recurrence'
import { attendeeLabel, eventColor, isParentsPair, parentsGradient } from '../lib/people'
import { kidStatuses, type KidStatus } from '../lib/conflicts'
import { remindersOnDate } from '../lib/notifications'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../lib/cx'
import { EventEditor, type EditorTarget } from './EventEditor'
import { ReminderEditor, type ReminderTarget } from './ReminderEditor'
import shared from '../styles/shared.module.css'
import s from './DayView.module.css'

// Layout scale. HOUR_H must match the gridline spacing in index.css.
const HOUR_H = 56
const PX_PER_MIN = HOUR_H / 60
const DAY_MIN = 24 * 60
const SNAP = 15

// The kid's lane is narrower than an adult's (she shares a parent's time).
const KID_WEIGHT = 0.66
const laneWeight = (p: Person) => (p.id === 'kid' ? KID_WEIGHT : 1)

export function DayView() {
  const { state, dispatch } = useApp()
  const day = state.selectedDay
  const people = Object.values(state.people)
  const [target, setTarget] = useState<EditorTarget | null>(null)
  const [reminderTarget, setReminderTarget] = useState<ReminderTarget | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const dateISO = addDays(state.weekStart, day)
  const isToday = dateISO === toISODate(new Date())
  const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const focusMin = nowMin ?? 7 * 60
    el.scrollTop = Math.max(0, focusMin * PX_PER_MIN - 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, dateISO])

  function addAt(attendees: PersonId[], minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setTarget({ mode: 'new', date: dateISO, attendees, start, end: Math.min(start + 60, DAY_MIN) })
  }

  const occs = occurrencesOnDate(state.events, dateISO)
  const timed = occs.filter((o) => !o.event.allDay).map((o) => o.event)
  const allDayOccs = occs.filter((o) => o.event.allDay)
  const spanning = timed.filter((e) => isParentsPair(e.attendees))

  // Coverage looks at the whole day: all-day events count as busy from 00:00–24:00.
  const coverage = occs.map((o) =>
    o.event.allDay ? { ...o.event, start: 0, end: DAY_MIN } : o.event,
  )
  const statuses = kidStatuses(coverage)
  const hasWarnings = [...statuses.values()].some((s) => s !== 'covered')

  const dayReminders = remindersOnDate(state.reminders, dateISO)

  const fullHeight = DAY_MIN * PX_PER_MIN
  const laneCols = people.map((p) => `${laneWeight(p)}fr`).join(' ')
  const totalWeight = people.reduce((s, p) => s + laneWeight(p), 0)
  const adultWeight = people.filter((p) => p.id !== 'kid').reduce((s, p) => s + laneWeight(p), 0)
  const adultPct = (adultWeight / totalWeight) * 100

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.weekNav}>
          <button onClick={() => dispatch({ type: 'shiftDay', delta: -1 })} aria-label="Previous day">
            <ChevronLeft size={20} />
          </button>
          <strong>{isoLabel(dateISO)}</strong>
          <button onClick={() => dispatch({ type: 'shiftDay', delta: 1 })} aria-label="Next day">
            <ChevronRight size={20} />
          </button>
        </div>

        {hasWarnings && (
          <div className={s.conflictLegend}>
            <span className={cx(s.warnKey, s.clash)}>⚠ No one free for Nora</span>
            <span className={cx(s.warnKey, s.needs)}>◌ Needs a grown-up</span>
          </div>
        )}

        <div className={s.alldayBar}>
          {allDayOccs.map((o) => (
            <AllDayChip
              key={o.event.id}
              occ={o}
              status={statuses.get(o.event.id)}
              onClick={() => setTarget({ mode: 'edit', event: o.event })}
            />
          ))}
          <button
            className={s.alldayAdd}
            onClick={() => setTarget({ mode: 'new', date: dateISO, attendees: ['me'] })}
          >
            + All-day
          </button>
        </div>

        <div className={s.reminderBar}>
          {dayReminders.map((r) => (
            <button
              key={r.id}
              className={s.reminderChip}
              onClick={() => setReminderTarget({ mode: 'edit', reminder: r })}
            >
              <span className={s.reminderIcon}>🔔</span>
              {minutesToTime(r.time)} {r.title}
              {r.repeat === 'daily' && <span className={s.reminderRepeat}>daily</span>}
            </button>
          ))}
          <button
            className={s.alldayAdd}
            onClick={() => setReminderTarget({ mode: 'new', date: dateISO })}
          >
            + Reminder
          </button>
        </div>
      </div>

      <div className={s.plannerBody} ref={scrollRef}>
        <div className={s.plannerHead}>
          <div />
          <div className={s.laneHeads} style={{ gridTemplateColumns: laneCols }}>
            {people.map((p) => (
              <div key={p.id} className={s.laneHead} style={{ color: p.color }}>
                <span className={s.dot} style={{ background: p.color }} />
                {p.name}
              </div>
            ))}
          </div>
        </div>

        <div className={s.plannerGrid}>
          <TimeGutter />
          <div className={s.lanes} style={{ height: fullHeight, gridTemplateColumns: laneCols }}>
            {people.map((p) => (
              <Lane
                key={p.id}
                person={p}
                dayEvents={timed}
                statuses={statuses}
                nowMin={nowMin}
                onAddAt={(min) => addAt([p.id], min)}
                onEdit={(event) => setTarget({ mode: 'edit', event })}
              />
            ))}

            {/* 'Both' (two-parent) blocks span the two parent columns, layered on top. */}
            <div className={s.sharedLayer} style={{ height: fullHeight, width: `${adultPct}%` }}>
              {layout(spanning).map(({ ev, col, cols }) => (
                <button
                  key={ev.id}
                  className={cx(s.tlEvent, s.shared)}
                  style={{
                    top: ev.start * PX_PER_MIN,
                    height: Math.max((ev.end - ev.start) * PX_PER_MIN, 16),
                    left: `calc(${(100 / cols) * col}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                    background: parentsGradient(state),
                  }}
                  onClick={() => setTarget({ mode: 'edit', event: ev })}
                >
                  <span className={s.tlTime}>
                    {minutesToTime(ev.start)}–{minutesToTime(ev.end)} · Both
                  </span>
                  <span className={s.tlTitle}>{ev.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {target && <EventEditor target={target} onClose={() => setTarget(null)} />}
      {reminderTarget && (
        <ReminderEditor target={reminderTarget} onClose={() => setReminderTarget(null)} />
      )}
    </section>
  )
}

function AllDayChip({
  occ,
  status,
  onClick,
}: {
  occ: DayOccurrence
  status: KidStatus | undefined
  onClick: () => void
}) {
  const { state } = useApp()
  const { event } = occ
  return (
    <button
      className={cx(s.alldayChip, status === 'clash' && s.warnClash, status === 'needs' && s.warnNeeds)}
      style={{ background: eventColor(state, event.attendees) }}
      onClick={onClick}
    >
      <span className={s.alldayTitle}>{event.title}</span>
      <span className={s.alldayMeta}>
        {attendeeLabel(state, event.attendees)}
        {occ.span > 1 && ` · day ${occ.offset + 1}/${occ.span}`}
        {event.reminders?.length ? ' 🔔' : ''}
        {status === 'clash' && ' ⚠'}
        {status === 'needs' && ' ◌'}
      </span>
    </button>
  )
}

function TimeGutter() {
  return (
    <div className={s.timeGutter} style={{ height: DAY_MIN * PX_PER_MIN }}>
      {Array.from({ length: 25 }, (_, h) => (
        <div key={h} className={s.gutterLabel} style={{ top: h * HOUR_H }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}

interface Laid {
  ev: CalendarEvent
  col: number
  cols: number
}

/** Greedy column layout so overlapping events in one lane sit side by side. */
function layout(events: CalendarEvent[]): Laid[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: Laid[] = []
  let cluster: CalendarEvent[] = []
  let clusterEnd = -1

  const flush = () => {
    const columns: CalendarEvent[][] = []
    for (const ev of cluster) {
      let placed = false
      for (const c of columns) {
        if (c[c.length - 1].end <= ev.start) {
          c.push(ev)
          placed = true
          break
        }
      }
      if (!placed) columns.push([ev])
    }
    const n = columns.length
    columns.forEach((c, ci) => c.forEach((ev) => result.push({ ev, col: ci, cols: n })))
  }

  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -1
    }
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, ev.end)
  }
  if (cluster.length) flush()
  return result
}

function Lane({
  person,
  dayEvents,
  statuses,
  nowMin,
  onAddAt,
  onEdit,
}: {
  person: Person
  dayEvents: CalendarEvent[]
  statuses: Map<string, KidStatus>
  nowMin: number | null
  onAddAt: (minute: number) => void
  onEdit: (event: CalendarEvent) => void
}) {
  const { state } = useApp()
  // This person's events, excluding two-parent 'Both' blocks (those span instead).
  const mine = dayEvents.filter((e) => e.attendees.includes(person.id) && !isParentsPair(e.attendees))
  const laid = layout(mine)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(`.${s.tlEvent}`)) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt((e.clientY - rect.top) / PX_PER_MIN)
  }

  return (
    <div className={s.lane} onClick={handleClick}>
      {nowMin != null && (
        <div className={s.nowLine} style={{ top: nowMin * PX_PER_MIN }}>
          <span className={s.nowDot} />
        </div>
      )}

      {laid.map(({ ev, col, cols }) => {
        const status = statuses.get(ev.id)
        const joint = ev.attendees.length > 1
        return (
          <button
            key={ev.id}
            className={cx(s.tlEvent, status === 'clash' && s.warnClash, status === 'needs' && s.warnNeeds)}
            style={{
              top: ev.start * PX_PER_MIN,
              height: Math.max((ev.end - ev.start) * PX_PER_MIN, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              background: eventColor(state, ev.attendees),
            }}
            onClick={() => onEdit(ev)}
          >
            <span className={s.tlTime}>
              {minutesToTime(ev.start)}–{minutesToTime(ev.end)}
              {ev.reminders?.length ? ' 🔔' : ''}
              {status === 'clash' && ' ⚠'}
              {status === 'needs' && ' ◌'}
            </span>
            <span className={s.tlTitle}>{ev.title}</span>
            {joint && <span className={s.tlTag}>{attendeeLabel(state, ev.attendees)}</span>}
          </button>
        )
      })}
    </div>
  )
}
