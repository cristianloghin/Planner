import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../lib/cx'
import { DAY_NAMES, minutesToTime, toISODate } from '../lib/dates'
import { isOccurrenceDone } from '../lib/occurrences'
import { colorStyle } from '../lib/palette'
import { eventColorKey } from '../lib/people'
import type { DayOccurrence } from '../lib/recurrence'
import { DAY_MIN, layoutBlocks } from '../lib/timelineLayout'
import { useMediaQuery } from '../lib/useMediaQuery'
import { loadZoom, useSwipeGestures } from '../lib/useSwipeGestures'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type { CompletionsMap } from '../types'
import { TimeGutter } from './TimeGutter'
import s from './WeekTimeline.module.css'

// The Week grid keeps its own zoom level: a comfortable hour height for one
// day (three lanes) is usually too tall for a seven-day overview.
const ZOOM_KEY = 'planner:weekHourH'

// Bars stay bare colored strips until there's room for text: on narrow
// screens the columns are so thin that titles only make sense once the user
// has pinch-zoomed in; on wide screens they fit at any zoom. A bar also needs
// this many pixels of height before its title renders at all.
const TITLE_HOUR_H = 96
const TITLE_MIN_PX = 18

/** One visible day: its ISO date plus that day's expanded occurrences. */
export interface WeekDay {
  dateISO: string
  occs: DayOccurrence[]
}

/**
 * Rendered inside the Week header when the timeline layout is active: the
 * seven day labels (today ringed in accent) with each day's all-day chips,
 * aligned over the grid's columns.
 */
export function WeekTimelineHead({
  weekDays,
  completions,
  onOpen,
}: {
  weekDays: WeekDay[]
  completions: CompletionsMap
  onOpen: (occ: DayOccurrence) => void
}) {
  const { state } = useApp()
  const todayISO = toISODate(new Date())
  return (
    <div className={s.head}>
      <div />
      <div className={s.headDays}>
        {weekDays.map(({ dateISO, occs }, dayIdx) => (
          <div key={dateISO} className={cx(s.headDay, dateISO === todayISO && s.today)}>
            <div className={s.headLabel}>
              <span className={s.headName}>{DAY_NAMES[dayIdx]}</span>
              <span className={s.headNum}>{Number(dateISO.slice(8, 10))}</span>
            </div>
            <div className={s.headAllday}>
              {occs
                .filter((o) => o.event.allDay)
                .map((o) => (
                  <button
                    type="button"
                    key={`${o.event.id}:${o.start}`}
                    className={cx(
                      s.alldayChip,
                      isOccurrenceDone(completions, o.event, o.start) && s.done,
                    )}
                    style={colorStyle(eventColorKey(state, o.event.attendees[0], o.event))}
                    onClick={() => onOpen(o)}
                    title={o.event.title}
                  >
                    {o.event.title}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The timed seven-column week grid — the Day view's timeline pattern with the
 * per-person lanes swapped for one column per weekday: shared time gutter,
 * swipe left/right to change week, pinch to zoom the hour height. Events
 * render as colored bars; titles appear once the zoom leaves room for them.
 */
export function WeekTimelineBody({
  weeks,
  completions,
  onOpen,
  onAddAt,
}: {
  /** Strip pages: [previous week, visible week, next week], seven days each. */
  weeks: WeekDay[][]
  completions: CompletionsMap
  onOpen: (occ: DayOccurrence) => void
  /** Tap on empty grid: create an event on `dateISO` around `minute`. */
  onAddAt: (dateISO: string, minute: number) => void
}) {
  const { state, dispatch } = useApp()
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY))
  const pxPerMin = hourH / 60

  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const { onClickCapture } = useSwipeGestures({
    scrollRef,
    stripRef,
    pageKey: weeks[1][0].dateISO,
    onNavigate: (delta) => dispatch({ type: 'shiftWeek', delta }),
    zoom: { hourH, setHourH, key: ZOOM_KEY },
  })

  // Tick once a minute so the "now" line moves and today-detection rolls over
  // at midnight.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(iv)
  }, [])
  const todayISO = toISODate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // First mount only: focus now when today is visible, else the working day.
  // Week navigation keeps the scroll position, matching the Day view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const focus = weeks[1].some((d) => d.dateISO === todayISO) ? nowMin : 7 * 60
    el.scrollTop = Math.max(0, focus * pxPerMin - 80)
  }, [])

  const narrow = useMediaQuery('(max-width: 720px)')
  const showTitles = !narrow || hourH >= TITLE_HOUR_H

  // Overlap-pack each day's timed occurrences (all attendees share the column),
  // for all three strip pages.
  const pages = useMemo(
    () =>
      weeks.map((weekDays) =>
        weekDays.map(({ dateISO, occs }) => ({
          dateISO,
          laid: layoutBlocks(
            occs
              .filter((o) => !o.event.allDay)
              .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end })),
          ),
        })),
      ),
    [weeks],
  )

  return (
    <div
      className={s.body}
      ref={scrollRef}
      // Browser owns vertical panning; we own horizontal swipe + pinch.
      style={{ touchAction: 'pan-y' }}
      onClickCapture={onClickCapture}
    >
      <div
        className={s.grid}
        style={
          {
            '--hour-h': `${hourH}px`,
            '--quarter-h': `${hourH / 4}px`,
          } as React.CSSProperties
        }
      >
        <TimeGutter hourH={hourH} />
        {/* The gutter stays put; only the week pages slide during a swipe. */}
        <div className={shared.swipeClip}>
          <div className={shared.swipeStrip} ref={stripRef}>
            {pages.map((days) => (
              <div className={s.days} key={days[0].dateISO} style={{ height: DAY_MIN * pxPerMin }}>
                {days.map(({ dateISO, laid }) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: tap-on-empty-space is a pointer affordance to prefill the editor; the keyboard path is the header's + button
                  <div
                    key={dateISO}
                    className={cx(s.dayCol, dateISO === todayISO && s.todayCol)}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest(`.${s.bar}`)) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      onAddAt(dateISO, (e.clientY - rect.top) / pxPerMin)
                    }}
                  >
                    {dateISO === todayISO && (
                      <div className={s.nowLine} style={{ top: nowMin * pxPerMin }}>
                        <span className={s.nowDot} />
                      </div>
                    )}
                    {laid.map(({ block, col, cols }) => {
                      const ev = block.occ.event
                      const height = Math.max((block.end - block.start) * pxPerMin, 12)
                      const done = isOccurrenceDone(completions, ev, block.occ.start)
                      return (
                        <button
                          type="button"
                          key={`${ev.id}:${block.occ.start}`}
                          className={cx(s.bar, done && s.done)}
                          style={{
                            top: block.start * pxPerMin,
                            height,
                            left: `calc(${(100 / cols) * col}% + 1px)`,
                            width: `calc(${100 / cols}% - 2px)`,
                            ...colorStyle(eventColorKey(state, ev.attendees[0], ev)),
                          }}
                          onClick={() => onOpen(block.occ)}
                          title={ev.title}
                          aria-label={`${ev.title}, ${minutesToTime(block.start)}–${minutesToTime(block.end)}`}
                        >
                          {showTitles && height >= TITLE_MIN_PX && (
                            <span className={s.barTitle}>{ev.title}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
