import { useEffect, useMemo, useRef, useState } from 'react'
import { type ColorKey, colorStyle } from '../assets/palette'
import shared from '../assets/styles/shared.module.css'
import { cx } from '../assets/utils/cx'
import { DAY_NAMES, isoWeekNumber, minutesToTime, toISODate } from '../assets/utils/dates'
import { eventColorKey } from '../domains/people/selectors'
import type { DayOccurrence } from '../lib/recurrence'
import { DAY_MIN, layoutBlocks } from '../lib/timelineLayout'
import { loadZoom, pageInert, useSwipeGestures } from '../lib/useSwipeGestures'
import { useCalendarNavigation } from '../navigation'
import { isOccurrenceDone } from '../services/recurrence/status'
import type { CompletionsMap, Person, PersonId } from '../types'
import { TimeGutter } from './TimeGutter'
import s from './WeekTimeline.module.css'

// The Week grid keeps its own zoom level: a comfortable hour height for one
// day (three lanes) is usually too tall for a seven-day overview.
const ZOOM_KEY = 'planner:weekHourH'

// A bar needs this many pixels of height before its title renders at all —
// below that the text can't fit a legible line anyway.
const TITLE_MIN_PX = 18

/** One visible day: its ISO date plus that day's expanded occurrences. */
export interface WeekDay {
  dateISO: string
  occs: DayOccurrence[]
}

/**
 * Column template shared by the head and the grid so they stay aligned: with
 * a focused day its column takes the space of four, the rest split the rest.
 * `undefined` falls back to the stylesheet's equal seven-way split.
 */
function dayColumns(focusDay: number | null): string | undefined {
  if (focusDay == null) return undefined
  return DAY_NAMES.map((_, i) => (i === focusDay ? 'minmax(0, 4fr)' : 'minmax(0, 1fr)')).join(' ')
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
  focusDay,
  onToggleDay,
  people,
  overrides,
}: {
  weekDays: WeekDay[]
  completions: CompletionsMap
  onOpen: (occ: DayOccurrence) => void
  /** Weekday index (0 = Mon) whose column is maximized, if any. */
  focusDay: number | null
  /** Tap a day label: maximize that column, or restore if already focused. */
  onToggleDay: (dayIdx: number) => void
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
}) {
  const todayISO = toISODate(new Date())
  return (
    <div className={s.head}>
      {/* The gutter corner doubles as the week-number badge. */}
      <div className={s.headWeek} aria-label={`Week ${isoWeekNumber(weekDays[0].dateISO)}`}>
        W{isoWeekNumber(weekDays[0].dateISO)}
      </div>
      <div className={s.headDays} style={{ gridTemplateColumns: dayColumns(focusDay) }}>
        {weekDays.map(({ dateISO, occs }, dayIdx) => (
          <div key={dateISO} className={cx(s.headDay, dateISO === todayISO && s.today)}>
            <button
              type="button"
              className={s.headLabel}
              onClick={() => onToggleDay(dayIdx)}
              aria-pressed={focusDay === dayIdx}
              aria-label={
                focusDay === dayIdx
                  ? 'Restore equal day columns'
                  : `Maximize ${DAY_NAMES[dayIdx]}'s column`
              }
            >
              <span className={s.headName}>{DAY_NAMES[dayIdx]}</span>
              <span className={s.headNum}>{Number(dateISO.slice(8, 10))}</span>
            </button>
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
                    style={colorStyle(
                      eventColorKey(people, overrides, o.event.attendees[0], o.event.colorKey),
                    )}
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
 * render as colored bars with their titles; when a day is maximized the
 * squeezed columns drop their titles.
 */
export function WeekTimelineBody({
  weeks,
  completions,
  onOpen,
  onAddAt,
  focusDay,
  people,
  overrides,
}: {
  /** Strip pages: [previous week, visible week, next week], seven days each. */
  weeks: WeekDay[][]
  completions: CompletionsMap
  onOpen: (occ: DayOccurrence) => void
  /** Tap on empty grid: create an event on `dateISO` around `minute`. */
  onAddAt: (dateISO: string, minute: number) => void
  /** Weekday index (0 = Mon) whose column is maximized, if any. */
  focusDay: number | null
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
}) {
  const nav = useCalendarNavigation()
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY))
  const pxPerMin = hourH / 60

  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const { onClickCapture } = useSwipeGestures({
    scrollRef,
    stripRef,
    pageKey: weeks[1][0].dateISO,
    onNavigate: (delta) => nav.shiftWeek(delta),
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
            {pages.map((days, pageIdx) => (
              <div
                className={s.days}
                key={days[0].dateISO}
                style={{ height: DAY_MIN * pxPerMin, gridTemplateColumns: dayColumns(focusDay) }}
                {...pageInert(pageIdx === 1)}
              >
                {days.map(({ dateISO, laid }, dayIdx) => (
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
                            ...colorStyle(
                              eventColorKey(people, overrides, ev.attendees[0], ev.colorKey),
                            ),
                          }}
                          onClick={() => onOpen(block.occ)}
                          title={ev.title}
                          aria-label={`${ev.title}, ${minutesToTime(block.start)}–${minutesToTime(block.end)}`}
                        >
                          {/* With a maximized day, the squeezed columns are too
                              thin for text — only the focused one keeps titles. */}
                          {(focusDay == null || dayIdx === focusDay) && height >= TITLE_MIN_PX && (
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
