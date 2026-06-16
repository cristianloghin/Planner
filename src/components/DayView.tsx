import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import type { CalendarEvent, Person, PersonId } from '../types'
import { addDays, dayLabel, minutesToTime, timeToMinutes, toISODate } from '../lib/dates'

// Layout scale. HOUR_H must match the gridline spacing in index.css.
const HOUR_H = 56
const PX_PER_MIN = HOUR_H / 60
const DAY_MIN = 24 * 60
const SNAP = 15

/** A draft passed to the editor: either a new event (no id) or an existing one. */
type Draft =
  | { mode: 'new'; personId: PersonId; start: number; end: number }
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

  // On day change, scroll to "now" if today, else to 07:00.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const focusMin = nowMin ?? 7 * 60
    el.scrollTop = Math.max(0, focusMin * PX_PER_MIN - 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, dateISO])

  function addAt(personId: PersonId, minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setDraft({ mode: 'new', personId, start, end: Math.min(start + 60, DAY_MIN) })
  }

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

      <div className="planner-head">
        <div className="gutter-spacer" />
        {people.map((p) => (
          <div key={p.id} className="lane-head" style={{ color: p.color }}>
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </div>
        ))}
      </div>

      <div className="planner-body" ref={scrollRef}>
        <TimeGutter />
        {people.map((p) => (
          <Lane
            key={p.id}
            person={p}
            day={day}
            nowMin={nowMin}
            onAddAt={(min) => addAt(p.id, min)}
            onEdit={(event) => setDraft({ mode: 'edit', event })}
          />
        ))}
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
  day,
  nowMin,
  onAddAt,
  onEdit,
}: {
  person: Person
  day: number
  nowMin: number | null
  onAddAt: (minute: number) => void
  onEdit: (event: CalendarEvent) => void
}) {
  const { state } = useApp()
  const laid = layout(state.events.filter((e) => e.day === day && e.personId === person.id))

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // Ignore clicks that landed on an event block.
    if ((e.target as HTMLElement).closest('.tl-event')) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt((e.clientY - rect.top) / PX_PER_MIN)
  }

  return (
    <div className="lane" style={{ height: DAY_MIN * PX_PER_MIN }} onClick={handleClick}>
      {nowMin != null && (
        <div className="now-line" style={{ top: nowMin * PX_PER_MIN }}>
          <span className="now-dot" />
        </div>
      )}

      {laid.map(({ ev, col, cols }) => {
        const top = ev.start * PX_PER_MIN
        const height = Math.max((ev.end - ev.start) * PX_PER_MIN, 16)
        const width = `calc(${100 / cols}% - 4px)`
        const left = `calc(${(100 / cols) * col}% + 2px)`
        return (
          <button
            key={ev.id}
            className="tl-event"
            style={{ top, height, left, width, background: person.color }}
            onClick={() => onEdit(ev)}
          >
            <span className="tl-time">
              {minutesToTime(ev.start)}–{minutesToTime(ev.end)}
            </span>
            <span className="tl-title">{ev.title}</span>
          </button>
        )
      })}
    </div>
  )
}

function EventEditor({ draft, day, onClose }: { draft: Draft; day: number; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const isEdit = draft.mode === 'edit'
  const base = isEdit ? draft.event : null

  const [title, setTitle] = useState(base?.title ?? '')
  const [start, setStart] = useState(minutesToTime(isEdit ? base!.start : draft.start))
  const [end, setEnd] = useState(minutesToTime(isEdit ? base!.end : draft.end))
  const [personId, setPersonId] = useState<PersonId>(isEdit ? base!.personId : draft.personId)

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const s = timeToMinutes(start)
    const en = Math.max(timeToMinutes(end), s + SNAP)
    if (isEdit) {
      dispatch({ type: 'updateEvent', event: { ...base!, title: title.trim(), start: s, end: en, personId } })
    } else {
      dispatch({ type: 'addEvent', event: { title: title.trim(), day, start: s, end: en, personId } })
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
        <select value={personId} onChange={(e) => setPersonId(e.target.value as PersonId)}>
          {Object.values(state.people).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
