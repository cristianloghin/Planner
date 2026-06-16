import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, Person, PersonId } from '../types'
import { addDays, dayLabel, minutesToTime, timeToMinutes, toISODate } from '../lib/dates'
import { attendeeLabel, eventColor, isParentsPair, parentsGradient } from '../lib/people'
import { kidStatuses, type KidStatus } from '../lib/conflicts'
import { AttendeeChips } from './AttendeeChips'

// Layout scale. HOUR_H must match the gridline spacing in index.css.
const HOUR_H = 56
const PX_PER_MIN = HOUR_H / 60
const DAY_MIN = 24 * 60
const SNAP = 15

// The kid's lane is narrower than an adult's (she shares a parent's time).
const KID_WEIGHT = 0.66
const laneWeight = (p: Person) => (p.id === 'kid' ? KID_WEIGHT : 1)

type Draft =
  | { mode: 'new'; attendees: PersonId[]; start: number; end: number }
  | { mode: 'edit'; event: CalendarEvent }

export function DayView() {
  const { state, dispatch } = useApp()
  const day = state.selectedDay
  const people = Object.values(state.people)
  const [draft, setDraft] = useState<Draft | null>(null)

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
    setDraft({ mode: 'new', attendees, start, end: Math.min(start + 60, DAY_MIN) })
  }

  const dayEvents = state.events.filter((e) => e.day === day)
  const spanning = dayEvents.filter((e) => isParentsPair(e.attendees))
  const statuses = kidStatuses(dayEvents)
  const hasWarnings = [...statuses.values()].some((s) => s !== 'covered')

  const fullHeight = DAY_MIN * PX_PER_MIN
  const laneCols = people.map((p) => `${laneWeight(p)}fr`).join(' ')
  const totalWeight = people.reduce((s, p) => s + laneWeight(p), 0)
  const adultWeight = people.filter((p) => p.id !== 'kid').reduce((s, p) => s + laneWeight(p), 0)
  const adultPct = (adultWeight / totalWeight) * 100

  return (
    <section className="planner">
      <div className="week-nav">
        <button onClick={() => dispatch({ type: 'shiftDay', delta: -1 })} aria-label="Previous day">
          ‹
        </button>
        <strong>{dayLabel(state.weekStart, day)}</strong>
        <button onClick={() => dispatch({ type: 'shiftDay', delta: 1 })} aria-label="Next day">
          ›
        </button>
      </div>

      {hasWarnings && (
        <div className="conflict-legend">
          <span className="warn-key clash">⚠ No one free for Nora</span>
          <span className="warn-key needs">◌ Needs a grown-up</span>
        </div>
      )}

      <div className="planner-head">
        <div className="gutter-spacer" />
        <div className="lane-heads" style={{ gridTemplateColumns: laneCols }}>
          {people.map((p) => (
            <div key={p.id} className="lane-head" style={{ color: p.color }}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <div className="planner-body" ref={scrollRef}>
        <TimeGutter />
        <div className="lanes" style={{ height: fullHeight, gridTemplateColumns: laneCols }}>
          {people.map((p) => (
            <Lane
              key={p.id}
              person={p}
              dayEvents={dayEvents}
              statuses={statuses}
              nowMin={nowMin}
              onAddAt={(min) => addAt([p.id], min)}
              onEdit={(event) => setDraft({ mode: 'edit', event })}
            />
          ))}

          {/* 'Both' (two-parent) blocks span the two parent columns, layered on top. */}
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
                  background: parentsGradient(state),
                }}
                onClick={() => setDraft({ mode: 'edit', event: ev })}
              >
                <span className="tl-time">
                  {minutesToTime(ev.start)}–{minutesToTime(ev.end)} · Both
                </span>
                <span className="tl-title">{ev.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {draft && <EventEditor draft={draft} day={day} onClose={() => setDraft(null)} />}
    </section>
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
              background: eventColor(state, ev.attendees),
            }}
            onClick={() => onEdit(ev)}
          >
            <span className="tl-time">
              {minutesToTime(ev.start)}–{minutesToTime(ev.end)}
              {status === 'clash' && ' ⚠'}
              {status === 'needs' && ' ◌'}
            </span>
            <span className="tl-title">{ev.title}</span>
            {joint && <span className="tl-tag">{attendeeLabel(state, ev.attendees)}</span>}
          </button>
        )
      })}
    </div>
  )
}

function EventEditor({ draft, day, onClose }: { draft: Draft; day: number; onClose: () => void }) {
  const { dispatch } = useApp()
  const isEdit = draft.mode === 'edit'
  const base = isEdit ? draft.event : null

  const [title, setTitle] = useState(base?.title ?? '')
  const [start, setStart] = useState(minutesToTime(isEdit ? base!.start : draft.start))
  const [end, setEnd] = useState(minutesToTime(isEdit ? base!.end : draft.end))
  const [attendees, setAttendees] = useState<PersonId[]>(isEdit ? base!.attendees : draft.attendees)

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const s = timeToMinutes(start)
    const en = Math.max(timeToMinutes(end), s + SNAP)
    if (isEdit) {
      dispatch({ type: 'updateEvent', event: { ...base!, title: title.trim(), start: s, end: en, attendees } })
    } else {
      dispatch({ type: 'addEvent', event: { title: title.trim(), day, start: s, end: en, attendees } })
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{isEdit ? 'Edit' : 'New'} block</h3>
        <input
          ref={titleRef}
          placeholder="What's the plan?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
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
        <label className="field">Who's involved?</label>
        <AttendeeChips value={attendees} onChange={setAttendees} />
        <div className="modal-actions">
          {isEdit && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                dispatch({ type: 'removeEvent', id: base!.id })
                onClose()
              }}
            >
              Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
