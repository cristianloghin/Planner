import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useLatest } from '../assets/hooks/useLatest'
import { type ColorKey, colorStyle } from '../assets/palette'
import shared from '../assets/styles/shared.module.css'
import { LoadingPill } from '../assets/ui/Spinner'
import { cx } from '../assets/utils/cx'
import { isoLabel, minutesToTime, toISODate } from '../assets/utils/dates'
import { hasReminders } from '../domains/events/selectors'
import { eventColorKey, personColorKey } from '../domains/people/selectors'
import { loadZoom, pageInert, useSwipeGestures } from '../services/gestures'
import type { DayOccurrence } from '../services/recurrence/expand'
import { DAY_MIN, type TimeBlock, layoutBlocks } from '../services/timeline-layout'
import type { CalendarEvent, Person, PersonId } from '../types'
import { Avatars } from './Avatars'
import s from './DayView.module.css'
import { TimeGutter } from './TimeGutter'
import { ViewHeader } from './ViewHeader'

const SNAP = 15
const ZOOM_KEY = 'planner:hourH'

/** One page of the swipe strip: a day, already expanded. */
export interface DayPage {
  iso: string
  timedBlocks: TimeBlock[]
  allDayOccs: DayOccurrence[]
}

/**
 * The Day timeline. Props-only: it is given the days to draw and told what to
 * call, and it reads no domain and opens no overlay.
 *
 * What it does own is how it looks — the pinch zoom, the scroll position and
 * the swipe gestures, none of which mean anything outside this view — plus a
 * once-a-minute tick so the "now" line moves and today rolls over at midnight.
 */
export function DayView({
  pages,
  people,
  overrides,
  dateISO,
  loading,
  onShiftDay,
  onGoToday,
  onPickSearch,
  onAddAt,
  onOpenOccurrence,
}: {
  /** Yesterday, the visible day, tomorrow — in that order. */
  pages: DayPage[]
  people: Person[]
  overrides: Record<PersonId, ColorKey>
  dateISO: string
  loading: boolean
  onShiftDay: (delta: number) => void
  onGoToday: () => void
  onPickSearch: (seriesId: string) => void
  onAddAt: (date: string, attendees: PersonId[], startMin: number, endMin: number) => void
  onOpenOccurrence: (occ: DayOccurrence) => void
}) {
  // Pixels-per-hour for the timeline; pinch-to-zoom adjusts it (Y axis only).
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY))
  const pxPerMin = hourH / 60
  // Mirror for scrollToMinute, which mount effects call with a stale closure.
  const hourHRef = useLatest(hourH)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Swipe to change day, pinch to zoom (shared with the Week grid).
  const { onClickCapture } = useSwipeGestures({
    scrollRef,
    stripRef,
    pageKey: dateISO,
    onNavigate: (delta) => onShiftDay(delta),
    zoom: { hourH, setHourH, key: ZOOM_KEY },
  })

  // Tick once a minute so the "now" line moves and today-detection rolls over
  // at midnight — without it both freeze at whatever the last interaction saw.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(iv)
  }, [])

  const nowISO = toISODate(now)
  const isToday = dateISO === nowISO
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Scroll the timeline so `minute` sits a little below the top edge.
  function scrollToMinute(minute: number) {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, minute * (hourHRef.current / 60) - 80)
  }

  // First mount only: focus now (or 7am). Day navigation deliberately keeps the
  // user's scroll position — jumping the timeline on every day change is jarring.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
  useEffect(() => {
    scrollToMinute(isToday ? nowMin : 7 * 60)
  }, [])

  function addAt(date: string, attendees: PersonId[], minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    onAddAt(date, attendees, start, Math.min(start + 60, DAY_MIN))
  }

  function goToday() {
    onGoToday()
    // Explicit "take me to now" intent, so re-focus the current time.
    const min = new Date().getHours() * 60 + new Date().getMinutes()
    requestAnimationFrame(() => scrollToMinute(min))
  }

  // The header (lane names, all-day chips) shows the visible day.
  const { allDayOccs } = pages[1]
  const fullHeight = DAY_MIN * pxPerMin

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={goToday}
        todayActive={isToday}
        onPickSearch={onPickSearch}
        nav={
          <div className={shared.weekNav}>
            <button type="button" onClick={() => onShiftDay(-1)} aria-label="Previous day">
              <ChevronLeft size={20} />
            </button>
            <strong>{isoLabel(dateISO)}</strong>
            <button type="button" onClick={() => onShiftDay(1)} aria-label="Next day">
              <ChevronRight size={20} />
            </button>
          </div>
        }
      >
        <div className={s.plannerHead}>
          <div />
          <div className={s.laneHeads} style={{ '--lanes': people.length } as CSSProperties}>
            {people.map((p) => (
              <div
                key={p.id}
                className={s.laneHead}
                style={colorStyle(personColorKey(people, overrides, p.id))}
              >
                <div>
                  <span className={s.dot} />
                  {p.name}
                </div>
                <div>
                  {allDayOccs
                    .filter((o) => o.attendees.includes(p.id))
                    .map((o) => (
                      <AllDayChip
                        key={`${o.event.id}:${o.start}`}
                        occ={o}
                        personId={p.id}
                        onClick={() => onOpenOccurrence(o)}
                        people={people}
                        overrides={overrides}
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
        onClickCapture={onClickCapture}
      >
        <div
          className={s.plannerGrid}
          style={
            {
              '--hour-h': `${hourH}px`,
              '--quarter-h': `${hourH / 4}px`,
            } as React.CSSProperties
          }
        >
          <TimeGutter hourH={hourH} />
          {/* The gutter stays put; only the day pages slide during a swipe. */}
          <div className={shared.swipeClip}>
            <div className={shared.swipeStrip} ref={stripRef}>
              {pages.map((page, pageIdx) => (
                <div
                  key={page.iso}
                  className={s.lanes}
                  style={{ height: fullHeight, '--lanes': people.length } as CSSProperties}
                  {...pageInert(pageIdx === 1)}
                >
                  {people.map((p) => (
                    <Lane
                      key={p.id}
                      person={p}
                      blocks={page.timedBlocks}
                      nowMin={page.iso === nowISO ? nowMin : null}
                      pxPerMin={pxPerMin}
                      onAddAt={(min) => addAt(page.iso, [p.id], min)}
                      onOpen={onOpenOccurrence}
                      people={people}
                      overrides={overrides}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && <LoadingPill />}
    </section>
  )
}

/** Compact badges shown on a block / chip. */
function badges(event: CalendarEvent) {
  return (
    <span className={s.badges}>
      {hasReminders(event) && <Bell className={s.badgeIcon} aria-label="Reminders" />}
    </span>
  )
}

function AllDayChip({
  occ,
  personId,
  onClick,
  people,
  overrides,
}: {
  occ: DayOccurrence
  personId: PersonId
  onClick: () => void
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
}) {
  const { event } = occ
  return (
    <button
      type="button"
      className={cx(s.alldayChip)}
      style={colorStyle(eventColorKey(people, overrides, personId, event.colorKey))}
      onClick={onClick}
    >
      <span className={s.alldayMeta}>{badges(event)}</span>
      <span className={s.alldayTitle}>{event.title}</span>
      {occ.span > 1 && <span className={s.allDayOffset}>{`${occ.offset + 1}/${occ.span}`}</span>}
    </button>
  )
}

function Lane({
  person,
  blocks,
  nowMin,
  pxPerMin,
  onAddAt,
  onOpen,
  people,
  overrides,
}: {
  person: Person
  blocks: TimeBlock[]
  nowMin: number | null
  pxPerMin: number
  onAddAt: (minute: number) => void
  onOpen: (occ: DayOccurrence) => void
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
}) {
  // Every block this person is on — shared events simply appear in each
  // attendee's lane, colored by that lane.
  const mine = blocks.filter((b) => b.occ.attendees.includes(person.id))
  const laid = layoutBlocks(mine)

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
        // Who is on it THIS day — an override replaces the series' roster.
        const attendees = block.occ.attendees
        const joint = attendees.length > 1
        return (
          <button
            type="button"
            key={`${ev.id}:${block.occ.start}`}
            className={cx(s.tlEvent)}
            style={{
              top: block.start * pxPerMin,
              height: Math.max((block.end - block.start) * pxPerMin, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              ...colorStyle(eventColorKey(people, overrides, person.id, ev.colorKey)),
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
              {badges(ev)}
            </span>
            <span className={s.tlTitle}>{ev.title}</span>
            {joint && <Avatars attendees={attendees} />}
          </button>
        )
      })}
    </div>
  )
}
