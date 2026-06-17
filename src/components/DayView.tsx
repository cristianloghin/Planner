import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, Member, MemberId } from '../types'
import { addDays, isoLabel, minutesToTime, toISODate } from '../lib/dates'
import { active } from '../lib/sync'
import { occurrencesOnDate, type DayOccurrence } from '../lib/recurrence'
import { adultsGradient, attendeeLabel, eventColor, isAdultGroup } from '../lib/people'
import { childStatuses, type CoverageStatus } from '../lib/conflicts'
import { remindersOnDate } from '../lib/notifications'
import { EventEditor, type EditorTarget } from './EventEditor'
import { ReminderEditor, type ReminderTarget } from './ReminderEditor'

// Layout scale. HOUR_H must match the gridline spacing in index.css.
const HOUR_H = 56
const PX_PER_MIN = HOUR_H / 60
const DAY_MIN = 24 * 60
const SNAP = 15

// A child's lane is narrower than an adult's (they share an adult's time).
const CHILD_WEIGHT = 0.66
const laneWeight = (m: Member) => (m.role === 'child' ? CHILD_WEIGHT : 1)

export function DayView() {
  const { state, dispatch } = useApp()
  const day = state.selectedDay
  // Adults first so the shared-event layer can span the leftmost columns.
  const members = [...active(state.members)].sort(
    (a, b) => (a.role === 'child' ? 1 : 0) - (b.role === 'child' ? 1 : 0),
  )
  const defaultAttendees = members[0] ? [members[0].id] : []
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

  function addAt(attendees: MemberId[], minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setTarget({ mode: 'new', date: dateISO, attendees, start, end: Math.min(start + 60, DAY_MIN) })
  }

  const occs = occurrencesOnDate(active(state.events), dateISO)
  const timed = occs.filter((o) => !o.event.allDay).map((o) => o.event)
  const allDayOccs = occs.filter((o) => o.event.allDay)
  const spanning = timed.filter((e) => isAdultGroup(members, e.attendees))

  // Coverage looks at the whole day: all-day events count as busy from 00:00–24:00.
  const coverage = occs.map((o) =>
    o.event.allDay ? { ...o.event, start: 0, end: DAY_MIN } : o.event,
  )
  const statuses = childStatuses(members, coverage)
  const hasWarnings = [...statuses.values()].some((s) => s !== 'covered')

  const dayReminders = remindersOnDate(active(state.reminders), dateISO)

  const fullHeight = DAY_MIN * PX_PER_MIN
  const laneCols = members.map((m) => `${laneWeight(m)}fr`).join(' ')
  const totalWeight = members.reduce((s, m) => s + laneWeight(m), 0)
  const adultWeight = members.filter((m) => m.role !== 'child').reduce((s, m) => s + laneWeight(m), 0)
  const adultPct = totalWeight ? (adultWeight / totalWeight) * 100 : 100

  return (
    <section className="planner view">
      <div className="view-head">
        <div className="week-nav">
          <button onClick={() => dispatch({ type: 'shiftDay', delta: -1 })} aria-label="Previous day">
            ‹
          </button>
          <strong>{isoLabel(dateISO)}</strong>
          <button onClick={() => dispatch({ type: 'shiftDay', delta: 1 })} aria-label="Next day">
            ›
          </button>
        </div>

        {hasWarnings && (
          <div className="conflict-legend">
            <span className="warn-key clash">⚠ No adult free</span>
            <span className="warn-key needs">◌ Needs a grown-up</span>
          </div>
        )}

        <div className="allday-bar">
          {allDayOccs.map((o) => (
            <AllDayChip
              key={o.event.id}
              occ={o}
              members={members}
              status={statuses.get(o.event.id)}
              onClick={() => setTarget({ mode: 'edit', event: o.event })}
            />
          ))}
          <button
            className="allday-add"
            onClick={() => setTarget({ mode: 'new', date: dateISO, attendees: defaultAttendees })}
          >
            + All-day
          </button>
        </div>

        <div className="reminder-bar">
          {dayReminders.map((r) => (
            <button
              key={r.id}
              className="reminder-chip"
              onClick={() => setReminderTarget({ mode: 'edit', reminder: r })}
            >
              <span className="reminder-icon">🔔</span>
              {minutesToTime(r.time)} {r.title}
              {r.repeat === 'daily' && <span className="reminder-repeat">daily</span>}
            </button>
          ))}
          <button
            className="allday-add"
            onClick={() => setReminderTarget({ mode: 'new', date: dateISO })}
          >
            + Reminder
          </button>
        </div>
      </div>

      <div className="planner-body" ref={scrollRef}>
        <div className="planner-head">
          <div className="gutter-spacer" />
          <div className="lane-heads" style={{ gridTemplateColumns: laneCols }}>
            {members.map((m) => (
              <div key={m.id} className="lane-head" style={{ color: m.color }}>
                <span className="dot" style={{ background: m.color }} />
                {m.name}
              </div>
            ))}
          </div>
        </div>

        <div className="planner-grid">
          <TimeGutter />
          <div className="lanes" style={{ height: fullHeight, gridTemplateColumns: laneCols }}>
            {members.map((m) => (
              <Lane
                key={m.id}
                member={m}
                members={members}
                dayEvents={timed}
                statuses={statuses}
                nowMin={nowMin}
                onAddAt={(min) => addAt([m.id], min)}
                onEdit={(event) => setTarget({ mode: 'edit', event })}
              />
            ))}

            {/* Shared adult ('Both') blocks span the adult columns, layered on top. */}
            <div className="shared-layer" style={{ height: fullHeight, width: `${adultPct}%` }}>
              {layout(spanning).map(({ ev, col, cols }) => (
                <button
                  key={ev.id}
                  className="tl-event shared"
                  style={{
                    top: ev.start * PX_PER_MIN,
                    height: Math.max((ev.end - ev.start) * PX_PER_MIN, 16),
                    left: `calc(${(100 / cols) * col}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                    background: adultsGradient(members, ev.attendees),
                  }}
                  onClick={() => setTarget({ mode: 'edit', event: ev })}
                >
                  <span className="tl-time">
                    {minutesToTime(ev.start)}–{minutesToTime(ev.end)} · {attendeeLabel(members, ev.attendees)}
                  </span>
                  <span className="tl-title">{ev.title}</span>
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
  members,
  status,
  onClick,
}: {
  occ: DayOccurrence
  members: Member[]
  status: CoverageStatus | undefined
  onClick: () => void
}) {
  const { event } = occ
  const warnClass = status === 'clash' ? ' warn-clash' : status === 'needs' ? ' warn-needs' : ''
  return (
    <button
      className={`allday-chip${warnClass}`}
      style={{ background: eventColor(members, event.attendees) }}
      onClick={onClick}
    >
      <span className="allday-title">{event.title}</span>
      <span className="allday-meta">
        {attendeeLabel(members, event.attendees)}
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
    <div className="time-gutter" style={{ height: DAY_MIN * PX_PER_MIN }}>
      {Array.from({ length: 25 }, (_, h) => (
        <div key={h} className="gutter-label" style={{ top: h * HOUR_H }}>
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
  member,
  members,
  dayEvents,
  statuses,
  nowMin,
  onAddAt,
  onEdit,
}: {
  member: Member
  members: Member[]
  dayEvents: CalendarEvent[]
  statuses: Map<string, CoverageStatus>
  nowMin: number | null
  onAddAt: (minute: number) => void
  onEdit: (event: CalendarEvent) => void
}) {
  // This member's events, excluding shared adult 'Both' blocks (those span instead).
  const mine = dayEvents.filter(
    (e) => e.attendees.includes(member.id) && !isAdultGroup(members, e.attendees),
  )
  const laid = layout(mine)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.tl-event')) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt((e.clientY - rect.top) / PX_PER_MIN)
  }

  return (
    <div className="lane" onClick={handleClick}>
      {nowMin != null && (
        <div className="now-line" style={{ top: nowMin * PX_PER_MIN }}>
          <span className="now-dot" />
        </div>
      )}

      {laid.map(({ ev, col, cols }) => {
        const status = statuses.get(ev.id)
        const warnClass = status === 'clash' ? ' warn-clash' : status === 'needs' ? ' warn-needs' : ''
        const joint = ev.attendees.length > 1
        return (
          <button
            key={ev.id}
            className={`tl-event${warnClass}`}
            style={{
              top: ev.start * PX_PER_MIN,
              height: Math.max((ev.end - ev.start) * PX_PER_MIN, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              background: eventColor(members, ev.attendees),
            }}
            onClick={() => onEdit(ev)}
          >
            <span className="tl-time">
              {minutesToTime(ev.start)}–{minutesToTime(ev.end)}
              {ev.reminders?.length ? ' 🔔' : ''}
              {status === 'clash' && ' ⚠'}
              {status === 'needs' && ' ◌'}
            </span>
            <span className="tl-title">{ev.title}</span>
            {joint && <span className="tl-tag">{attendeeLabel(members, ev.attendees)}</span>}
          </button>
        )
      })}
    </div>
  )
}
