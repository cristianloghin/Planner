import {
  AlertTriangle,
  Bell,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCompletionsForRange } from '../data/completions'
import { checklistEntries, hasReminders } from '../lib/attachments'
import { type Busy, type ChildStatus, childStatuses } from '../lib/conflicts'
import { cx } from '../lib/cx'
import { addDays, isoLabel, minutesToTime, toISODate } from '../lib/dates'
import {
  isOccurrenceDone,
  occKey,
  occurrenceStatus,
  prerequisiteDatesInRange,
} from '../lib/occurrences'
import { colorStyle } from '../lib/palette'
import { eventColorKey, peopleList, personColorKey } from '../lib/people'
import { type DayOccurrence, nextRelevantDate, occurrencesOnDate } from '../lib/recurrence'
import { useLatest } from '../lib/useLatest'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type { CalendarEvent, CompletionsMap, Person, PersonId } from '../types'
import { Avatars } from './Avatars'
import s from './DayView.module.css'
import { type EditorTarget, EventEditor } from './EventEditor'
import { OccurrenceSheet } from './OccurrenceSheet'
import { LoadingPill } from './Spinner'
import { ViewHeader } from './ViewHeader'

// Layout scale. The hour height is user-zoomable (pinch); the rest are fixed.
// The default must match --hour-h in tokens.css for the very first paint.
const DEFAULT_HOUR_H = 56
const MIN_HOUR_H = 28
const MAX_HOUR_H = 160
const DAY_MIN = 24 * 60
const SNAP = 15
const ZOOM_KEY = 'planner:hourH'

// Past this much horizontal travel a touch is a day swipe (not a tap/scroll);
// the slide animation that commits the change runs for this many ms.
const SWIPE_COMMIT = 60
const SWIPE_SLIDE_MS = 200

const clampZoom = (h: number) => Math.min(MAX_HOUR_H, Math.max(MIN_HOUR_H, h))

/** Last zoom level the user pinched to, or the default. */
function loadZoom(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_HOUR_H
  const raw = Number(localStorage.getItem(ZOOM_KEY))
  return raw ? clampZoom(raw) : DEFAULT_HOUR_H
}

/** A timed occurrence clamped to the current day, ready to lay out. */
interface DayBlock {
  occ: DayOccurrence
  start: number
  end: number
}

export function DayView() {
  const { state, dispatch } = useApp()
  const day = state.selectedDay
  const people = peopleList(state)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [sheet, setSheet] = useState<{
    event: CalendarEvent
    date: string
  } | null>(null)

  // Pixels-per-hour for the timeline; pinch-to-zoom adjusts it (Y axis only).
  const [hourH, setHourH] = useState(loadZoom)
  const pxPerMin = hourH / 60
  // Mirror for the native touch listeners, which bind once and would otherwise
  // close over a stale hour height mid-gesture.
  const hourHRef = useLatest(hourH)

  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Tick once a minute so the "now" line moves and today-detection rolls over
  // at midnight — without it both freeze at whatever the last interaction saw.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(iv)
  }, [])

  const dateISO = addDays(state.weekStart, day)
  const isToday = dateISO === toISODate(now)
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : null

  // Windowed per-occurrence state for this day (plus the dates of any
  // prerequisites its occurrences wait on, so their met/unmet resolves even
  // when they live outside the window).
  const prereqDates = useMemo(
    () => prerequisiteDatesInRange(state.dependencies, dateISO, dateISO),
    [state.dependencies, dateISO],
  )
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    dateISO,
    dateISO,
    prereqDates,
  )

  // Scroll the timeline so `minute` sits a little below the top edge.
  function scrollToMinute(minute: number) {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, minute * (hourHRef.current / 60) - 80)
  }

  // First mount only: focus now (or 7am). Day navigation deliberately keeps the
  // user's scroll position — jumping the timeline on every day change is jarring.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
  useEffect(() => {
    scrollToMinute(nowMin ?? 7 * 60)
  }, [])

  // ---- touch gestures: swipe to change day, pinch to zoom -----------------
  const g = useRef({
    mode: 'none' as 'none' | 'decide' | 'swipe' | 'pinch',
    x0: 0,
    y0: 0,
    dx: 0,
    moved: false,
    // pinch
    dist0: 0,
    hour0: DEFAULT_HOUR_H,
    focalMin: 0,
    focalOff: 0,
  })
  // Set after a real swipe/drag so the synthetic click doesn't add an event.
  const suppressClick = useRef(false)
  // Pinch focal point, consumed by the layout effect that re-pins scroll below.
  const pinchAnchor = useRef<{ focalMin: number; focalOff: number } | null>(null)

  // Keep the focal point fixed while a pinch changes the timeline height. Runs
  // after the DOM has the new heights, so the math uses the post-zoom scale.
  useLayoutEffect(() => {
    const a = pinchAnchor.current
    const el = scrollRef.current
    if (!a || !el) return
    el.scrollTop = a.focalMin * (hourH / 60) - a.focalOff
  }, [hourH])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the listeners bind once and read live values through refs (hourHRef, g); `dispatch` is stable
  useEffect(() => {
    const el = scrollRef.current
    const grid = gridRef.current
    if (!el || !grid) return

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onStart = (e: TouchEvent) => {
      const st = g.current
      if (e.touches.length === 2) {
        const rect = el.getBoundingClientRect()
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        st.mode = 'pinch'
        st.dist0 = dist(e.touches)
        st.hour0 = hourHRef.current
        st.focalOff = midY - rect.top
        st.focalMin = (el.scrollTop + st.focalOff) / (hourHRef.current / 60)
        grid.style.transition = 'none'
        grid.style.transform = ''
      } else if (e.touches.length === 1) {
        st.mode = 'decide'
        st.x0 = e.touches[0].clientX
        st.y0 = e.touches[0].clientY
        st.dx = 0
        st.moved = false
      }
    }

    const onMove = (e: TouchEvent) => {
      const st = g.current
      if (st.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault()
        const next = clampZoom((st.hour0 * dist(e.touches)) / st.dist0)
        pinchAnchor.current = { focalMin: st.focalMin, focalOff: st.focalOff }
        setHourH(next)
        return
      }
      if (st.mode === 'decide') {
        const dx = e.touches[0].clientX - st.x0
        const dy = e.touches[0].clientY - st.y0
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Horizontal intent → swipe; otherwise hand back to native scrolling.
        st.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'none'
        if (st.mode === 'none') return
      }
      if (st.mode === 'swipe') {
        e.preventDefault()
        st.dx = e.touches[0].clientX - st.x0
        st.moved = true
        grid.style.transition = 'none'
        grid.style.transform = `translateX(${st.dx}px)`
      }
    }

    const onEnd = () => {
      const st = g.current
      if (st.mode === 'pinch') {
        pinchAnchor.current = null
        localStorage.setItem(ZOOM_KEY, String(hourHRef.current))
        st.mode = 'none'
        return
      }
      if (st.mode === 'swipe') {
        if (st.moved) suppressClick.current = true
        const w = el.clientWidth
        if (Math.abs(st.dx) > SWIPE_COMMIT) {
          // Slide the current day out the way it was dragged, swap, then slide
          // the new day in from the opposite edge — a one-rendered-day carousel.
          const dir = st.dx < 0 ? -1 : 1
          grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
          grid.style.transform = `translateX(${dir * w}px)`
          window.setTimeout(() => {
            dispatch({ type: 'shiftDay', delta: -dir })
            grid.style.transition = 'none'
            grid.style.transform = `translateX(${-dir * w}px)`
            requestAnimationFrame(() => {
              grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
              grid.style.transform = 'translateX(0)'
            })
          }, SWIPE_SLIDE_MS)
        } else {
          grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
          grid.style.transform = 'translateX(0)'
        }
      }
      st.mode = 'none'
    }

    const noGesture = (e: Event) => e.preventDefault()

    // passive:false so the pinch/swipe handlers can preventDefault the browser's
    // own pinch-zoom and horizontal overscroll.
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('gesturestart', noGesture) // iOS Safari pinch-zoom
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('gesturestart', noGesture)
    }
  }, [])

  function addAt(attendees: PersonId[], minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setEditor({
      mode: 'new',
      date: dateISO,
      attendees,
      startMin: start,
      endMin: Math.min(start + 60, DAY_MIN),
    })
  }

  function openSheet(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start })
  }

  // None of this depends on zoom or gesture state, and it's the expensive part
  // of a render (recurrence expansion + conflict analysis) — memoize so a
  // pinch-zoom frame or timer tick doesn't recompute it.
  const { timedBlocks, allDayOccs, statuses, hasWarnings } = useMemo(() => {
    const occs = occurrencesOnDate(state.events, dateISO, completions)
    const timedBlocks: DayBlock[] = occs
      .filter((o) => !o.event.allDay)
      .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }))
    const allDayOccs = occs.filter((o) => o.event.allDay)

    // Coverage looks at the whole day: all-day events count as busy 00:00–24:00.
    const coverage: Busy[] = occs.map((o) => ({
      id: o.event.id,
      attendees: o.event.attendees,
      start: o.event.allDay ? 0 : o.segment.start,
      end: o.event.allDay ? DAY_MIN : o.segment.end,
    }))
    const statuses = childStatuses(coverage, state.people)
    const hasWarnings = [...statuses.values()].some((s) => s !== 'covered')
    return { timedBlocks, allDayOccs, statuses, hasWarnings }
  }, [state.events, completions, state.people, dateISO])

  const fullHeight = DAY_MIN * pxPerMin

  // Open a search hit: jump the day to the event's next upcoming occurrence
  // (falling back to the series anchor for an ended series) and open its editor.
  function openSearchHit(seriesId: string) {
    const event = state.events.find((e) => e.id === seriesId)
    if (!event) return
    const date = nextRelevantDate(event)
    dispatch({ type: 'goToDate', date })
    setEditor({ mode: 'edit', event, occurrenceDate: date })
  }

  function goToday() {
    dispatch({ type: 'goToDate', date: toISODate(new Date()) })
    // Explicit "take me to now" intent, so re-focus the current time.
    const now = new Date().getHours() * 60 + new Date().getMinutes()
    requestAnimationFrame(() => scrollToMinute(now))
  }

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={goToday}
        todayActive={isToday}
        onPickSearch={openSearchHit}
        rightExtra={hasWarnings && <AlertTriangle className={s.alertBadge} />}
        nav={
          <div className={shared.weekNav}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'shiftDay', delta: -1 })}
              aria-label="Previous day"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{isoLabel(dateISO)}</strong>
            <button
              type="button"
              onClick={() => dispatch({ type: 'shiftDay', delta: 1 })}
              aria-label="Next day"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      >
        <div className={s.plannerHead}>
          <div />
          <div className={s.laneHeads}>
            {people.map((p) => (
              <div
                key={p.id}
                className={s.laneHead}
                style={colorStyle(personColorKey(state, p.id))}
              >
                <div>
                  <span className={s.dot} />
                  {p.name}
                </div>
                <div>
                  {allDayOccs
                    .filter((o) => o.event.attendees.includes(p.id))
                    .map((o) => (
                      <AllDayChip
                        key={`${o.event.id}:${o.start}`}
                        occ={o}
                        personId={p.id}
                        status={statuses.get(o.event.id)}
                        completions={completions}
                        onClick={() => openSheet(o)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ViewHeader>
      <div
        className={s.plannerBody}
        ref={scrollRef}
        // Browser owns vertical panning; we own horizontal swipe + pinch.
        style={{ touchAction: 'pan-y' }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        <div
          className={s.plannerGrid}
          ref={gridRef}
          style={
            {
              '--hour-h': `${hourH}px`,
              '--quarter-h': `${hourH / 4}px`,
            } as React.CSSProperties
          }
        >
          <TimeGutter hourH={hourH} />
          <div className={s.lanes} style={{ height: fullHeight }}>
            {people.map((p) => (
              <Lane
                key={p.id}
                person={p}
                blocks={timedBlocks}
                statuses={statuses}
                completions={completions}
                nowMin={nowMin}
                pxPerMin={pxPerMin}
                onAddAt={(min) => addAt([p.id], min)}
                onOpen={openSheet}
              />
            ))}
          </div>
        </div>
      </div>

      {completionsLoading && <LoadingPill />}

      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setEditor({
              mode: 'edit',
              event: sheet.event,
              occurrenceDate: sheet.date,
            })
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}

/** Compact badges shown on a block / chip: reminders, checklist progress, done, kid status. */
function badges(
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
  status: ChildStatus | undefined,
) {
  const entries = checklistEntries(event)
  let checklist: { n: number; total: number } | null = null
  if (entries.length) {
    const checked = completions[occKey(event.id, date)]?.checked ?? {}
    const n = entries.filter((e) => checked[e.id]).length
    checklist = { n, total: entries.length }
  }
  return (
    <span className={s.badges}>
      {hasReminders(event) && <Bell className={s.badgeIcon} aria-label="Reminders" />}
      {checklist && (
        <span className={s.badge}>
          <CheckSquare className={s.badgeIcon} aria-label="Checklist" />
          {checklist.n}/{checklist.total}
        </span>
      )}
      {status === 'clash' && <AlertTriangle className={s.badgeIcon} aria-label="Clash" />}
      {status === 'needs' && <CircleDashed className={s.badgeIcon} aria-label="Needs attention" />}
    </span>
  )
}

function AllDayChip({
  occ,
  personId,
  status,
  completions,
  onClick,
}: {
  occ: DayOccurrence
  personId: PersonId
  status: ChildStatus | undefined
  completions: CompletionsMap
  onClick: () => void
}) {
  const { state } = useApp()
  const { event } = occ
  const done = isOccurrenceDone(completions, event, occ.start)
  return (
    <button
      type="button"
      className={cx(
        s.alldayChip,
        done && s.done,
        status === 'clash' && s.warnClash,
        status === 'needs' && s.warnNeeds,
      )}
      style={colorStyle(eventColorKey(state, personId, event))}
      onClick={onClick}
    >
      <span className={s.alldayMeta}>{badges(completions, event, occ.start, status)}</span>
      <span className={s.alldayTitle}>{event.title}</span>
      {occ.span > 1 && <span className={s.allDayOffset}>{`${occ.offset + 1}/${occ.span}`}</span>}
    </button>
  )
}

const GUTTER_HOURS = Array.from({ length: 25 }, (_, h) => h)

function TimeGutter({ hourH }: { hourH: number }) {
  return (
    <div className={s.timeGutter} style={{ height: DAY_MIN * (hourH / 60) }}>
      {GUTTER_HOURS.map((h) => (
        <div key={h} className={s.gutterLabel} style={{ top: h * hourH }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}

interface Laid {
  block: DayBlock
  col: number
  cols: number
}

/** Greedy column layout so overlapping blocks in one lane sit side by side. */
function layout(blocks: DayBlock[]): Laid[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: Laid[] = []
  let cluster: DayBlock[] = []
  let clusterEnd = -1

  const flush = () => {
    const columns: DayBlock[][] = []
    for (const b of cluster) {
      let placed = false
      for (const c of columns) {
        if (c[c.length - 1].end <= b.start) {
          c.push(b)
          placed = true
          break
        }
      }
      if (!placed) columns.push([b])
    }
    const n = columns.length
    columns.forEach((c, ci) => c.forEach((block) => result.push({ block, col: ci, cols: n })))
  }

  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -1
    }
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return result
}

function Lane({
  person,
  blocks,
  statuses,
  completions,
  nowMin,
  pxPerMin,
  onAddAt,
  onOpen,
}: {
  person: Person
  blocks: DayBlock[]
  statuses: Map<string, ChildStatus>
  completions: CompletionsMap
  nowMin: number | null
  pxPerMin: number
  onAddAt: (minute: number) => void
  onOpen: (occ: DayOccurrence) => void
}) {
  const { state } = useApp()
  // Every block this person is on — shared events simply appear in each
  // attendee's lane, colored by that lane.
  const mine = blocks.filter((b) => b.occ.event.attendees.includes(person.id))
  const laid = layout(mine)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(`.${s.tlEvent}`)) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt((e.clientY - rect.top) / pxPerMin)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-on-empty-space is a pointer affordance to prefill the editor; the keyboard path is the header's + button
    <div className={s.lane} onClick={handleClick}>
      {nowMin != null && (
        <div className={s.nowLine} style={{ top: nowMin * pxPerMin }}>
          <span className={s.nowDot} />
        </div>
      )}

      {laid.map(({ block, col, cols }) => {
        const ev = block.occ.event
        const status = statuses.get(ev.id)
        const joint = ev.attendees.length > 1
        const done = isOccurrenceDone(completions, ev, block.occ.start)
        const blocked = occurrenceStatus(state, completions, ev, block.occ.start) === 'blocked'
        return (
          <button
            type="button"
            key={`${ev.id}:${block.occ.start}`}
            className={cx(
              s.tlEvent,
              done && s.done,
              blocked && s.blocked,
              status === 'clash' && s.warnClash,
              status === 'needs' && s.warnNeeds,
            )}
            style={{
              top: block.start * pxPerMin,
              height: Math.max((block.end - block.start) * pxPerMin, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              ...colorStyle(eventColorKey(state, person.id, ev)),
            }}
            onClick={() => onOpen(block.occ)}
          >
            <span className={s.tlTime}>
              {minutesToTime(block.start)}–{minutesToTime(block.end)}
              {block.occ.moved && (
                <span className={s.tlTag} aria-label="Moved from another day">
                  {' '}
                  ↔ moved
                </span>
              )}
              {badges(completions, ev, block.occ.start, status)}
            </span>
            <span className={s.tlTitle}>{ev.title}</span>
            {joint && <Avatars attendees={ev.attendees} />}
          </button>
        )
      })}
    </div>
  )
}
