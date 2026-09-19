import { createLayout, slot } from '@mikrostack/rst'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { type CSSProperties, Children, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLatest } from '../assets/hooks/useLatest'
import { cx } from '../assets/utils/cx'
import { type SwipeZoom, pageInert, scrollOrigin, useSwipeGestures } from '../services/gestures'

import { IconButton } from '../assets/ui/IconButton'
import styles from './Calendar.module.css'

interface CalendarViewProps {
  /** Identity of the current page: an ISO date, a week start, a month cursor. */
  pageKey: string
  onNavigate: (delta: 1 | -1) => void
  onGoToday: () => void
  todayActive?: boolean
  /** Text over the gutter, in the lane row (a week number). */
  gutterLabel?: string
  zoom?: SwipeZoom
  /** Minute to scroll to on first mount; unset leaves the scroller at the top. */
  initialMinute?: number
  /** Minute to draw the "now" line at; unset draws none (the page is not today). */
  nowMinute?: number
  isMonth?: boolean
}

/** The column template for lanes with the given relative widths. */
function laneColumns(weights: number[]): string {
  return weights.map((w) => `minmax(0, ${w}fr)`).join(' ')
}

/** One lane head. `weight` is its relative width: an expanded lane is wider. */
function LaneSlot({ children }: { weight?: number; children?: ReactNode }) {
  return <>{children}</>
}

/** One lane's all-day chips, in the band above the page. */
function AllDayCell({ children }: { children?: ReactNode }) {
  return <div className={styles.allDayCell}>{children}</div>
}

/**
 * What a deck page carries: one `AllDay` cell per lane, in lane order, and
 * the `Body` the page scrolls. One object, three keys — the library keys
 * slot identity by path, so the three pages' fills stay distinct.
 */
const page = {
  AllDay: slot({ component: AllDayCell, multiple: true }),
  Body: slot({ required: true }),
}

/**
 * Search on the left, prev / title / next in the middle, "jump to today" on
 * the right, and a row of lane heads underneath.
 */
function Header({
  search,
  title,
  lanes,
  todayActive,
  gutterLabel,
  onNavigate,
  onGoToday,
}: {
  search: ReactNode
  title: ReactNode
  lanes: ReactNode[]
  todayActive?: boolean
  gutterLabel?: string
  onNavigate: (delta: 1 | -1) => void
  onGoToday: () => void
}) {
  return (
    <div className={styles.head}>
      <div className={styles.headRow}>
        <div className={styles.headSide}>{search}</div>
        <div className={styles.nav}>
          <IconButton onClick={() => onNavigate(-1)} label="Previous" icon={ChevronLeft} />
          <h1>{title}</h1>
          <IconButton onClick={() => onNavigate(1)} label="Next" icon={ChevronRight} />
        </div>
        <div className={styles.headSide}>
          <IconButton
            active={todayActive}
            onClick={onGoToday}
            label="Go to today"
            icon={Calendar}
          />
        </div>
      </div>
      {lanes.length > 0 && (
        <div className={styles.lanesRow}>
          <div className={styles.gutterLabel}>{gutterLabel && <span>{gutterLabel}</span>}</div>
          <div className={styles.lanes}>{lanes}</div>
        </div>
      )}
    </div>
  )
}

/**
 * The calendar frame: a fixed header over a scrolling three-page deck.
 *
 * The header's `Lane` slots are one per column; their `weight`s become the
 * column template, which the view publishes once as `--lane-columns` on the
 * frame. The header's lane row, the all-day band and whatever the pages draw
 * all read it, so head and body agree without either being told.
 *
 * The deck is the view's: it owns the scroller, the strip and the gesture
 * that slides between `Previous`, `Current` and `Next`. It never knows what a
 * page shows. When a swipe commits it calls `onNavigate`, the route moves its
 * date and re-renders all three pages, and `pageKey` changing is how the deck
 * knows the new page has landed so it can recentre before paint. The arrows
 * fire the same `onNavigate`, so a route names the intent once.
 *
 * Each page has two parts. Its `AllDay` cells, one per lane, go in a band
 * that sits at the top of the scroller and stays pinned there as the page
 * scrolls under it; its `Body` goes in the page itself. The band is a second
 * three-page strip that the gesture slides together with the first, so a
 * day's chips arrive with the day. The band is as tall as the current page's
 * chips need, and absent altogether when no page has any.
 *
 * Zoom is lent by the route, because pinch and swipe share one gesture
 * binding but the zoom key is per screen and the month has none.
 *
 * A page body is whatever the route drops in — a `TimelineView` of columns,
 * a `MonthGridView` of cells. The lane template is inherited by anything
 * inside. `Footer` sits under the deck, in the same scroller, and does not
 * slide with it: a swipe changes the pages, the footer stays.
 *
 * The "now" line is the frame's too, for the same reason the gutter is: it
 * marks a time on the axis, not a thing on a page. Drawn once over gutter
 * and pages alike, outside the clip, its dot sits whole on the gutter's edge
 * and the line runs on across every lane; the pages slide under it, and it
 * goes when the page that lands is not today.
 */
export const CalendarView = createLayout(
  {
    Header: {
      Title: slot({ required: true }),
      Search: slot(),
      Lane: slot({ component: LaneSlot, multiple: true }),
    },

    Gutter: slot(),
    Previous: page,
    Current: page,
    Next: page,
    Footer: slot(),
  },
  (
    {
      pageKey,
      onNavigate,
      onGoToday,
      todayActive,
      gutterLabel,
      zoom,
      initialMinute,
      nowMinute,
      isMonth = false,
    }: CalendarViewProps,
    { slots },
  ) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stripRef = useRef<HTMLDivElement>(null)
    const bandRef = useRef<HTMLDivElement>(null)
    const bandStripRef = useRef<HTMLDivElement>(null)
    const topRef = useRef<HTMLDivElement>(null)
    // Whether the page has scrolled away from the top: the head shows an edge
    // only once content slides under it. Known from a sentinel at the top of
    // the scroller, so the browser tells us when it changes and nothing
    // reads scroll positions per frame.
    const [scrolled, setScrolled] = useState(false)
    const pxPerMin = (zoom?.hourH ?? 60) / 60
    // Mirror for scrollToMinute, which mount effects call with a stale closure.
    const pxPerMinRef = useLatest(pxPerMin)

    const { onClickCapture } = useSwipeGestures({
      scrollRef,
      stripRef,
      followRefs: [bandStripRef],
      pageKey,
      onNavigate,
      zoom,
    })

    // Scroll the timeline so `minute` sits a little below the band, which
    // stays pinned over the top of the scroller.
    function scrollToMinute(minute: number) {
      const el = scrollRef.current
      const strip = stripRef.current
      if (!el || !strip) return
      const bandH = bandRef.current?.offsetHeight ?? 0
      const top = scrollOrigin(el, strip) - bandH + minute * pxPerMinRef.current - 80
      el.scrollTop = Math.max(0, top)
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
    useEffect(() => {
      if (initialMinute != null) scrollToMinute(initialMinute)
    }, [])

    useEffect(() => {
      const el = scrollRef.current
      const top = topRef.current
      if (!el || !top) return
      // Several records can arrive in one callback; the last one is the truth.
      const observer = new IntersectionObserver(
        (entries) => setScrolled(!entries[entries.length - 1].isIntersecting),
        { root: el },
      )
      observer.observe(top)
      return () => observer.disconnect()
    }, [])

    // The route changes the date; the view re-focuses the current time, because
    // "take me to now" is an explicit intent and the scroll position is ours.
    function goToday() {
      onGoToday()
      const min = new Date().getHours() * 60 + new Date().getMinutes()
      requestAnimationFrame(() => scrollToMinute(min))
    }

    const lanes = slots.Header.Lane.elements
    const weights = slots.Header.Lane.props.map((p) => p.weight ?? 1)

    // The band exists only while some page has a chip; an empty cell per lane
    // is how a route keeps the cells aligned, not a reason to draw the band.
    // Its height follows the current page: with nothing on it the band is
    // flat, and the neighbours' chips arrive with their page.
    const hasChips = (p: typeof slots.Current) =>
      p.AllDay.props.some((cell) => Children.count(cell.children) > 0)
    const hasAllDay = [slots.Previous, slots.Current, slots.Next].some(hasChips)
    const currentHasAllDay = hasChips(slots.Current)

    return (
      <section
        className={styles.CalendarView}
        style={{ '--lane-columns': laneColumns(weights) } as CSSProperties}
        data-scrolled={scrolled || undefined}
      >
        <Header
          search={slots.Header.Search}
          title={slots.Header.Title}
          lanes={lanes}
          todayActive={todayActive}
          gutterLabel={gutterLabel}
          onNavigate={onNavigate}
          onGoToday={goToday}
        />
        <div
          className={styles.body}
          ref={scrollRef}
          // Browser owns vertical panning; we own horizontal swipe + pinch.
          style={{ touchAction: 'pan-y' }}
          onClickCapture={onClickCapture}
        >
          <div className={styles.top} ref={topRef} />
          {hasAllDay && (
            <div
              className={styles.allDay}
              ref={bandRef}
              data-empty={!currentHasAllDay || undefined}
            >
              {slots.Gutter.filled && <div className={styles.gutter} />}
              <div className={styles.clip}>
                <div className={styles.allDayStrip} ref={bandStripRef}>
                  <div className={cx(styles.allDayPage, styles.allDayPrev)} {...pageInert(false)}>
                    {slots.Previous.AllDay}
                  </div>
                  <div className={styles.allDayPage}>{slots.Current.AllDay}</div>
                  <div className={cx(styles.allDayPage, styles.allDayNext)} {...pageInert(false)}>
                    {slots.Next.AllDay}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className={cx(styles.grid, isMonth ? styles.noTopPadding : null)}>
            {slots.Gutter.filled && <div className={styles.gutter}>{slots.Gutter}</div>}
            {/* The gutter stays put; only the pages slide during a swipe. */}
            <div className={styles.clip}>
              <div className={styles.strip} ref={stripRef}>
                <div className={styles.page} {...pageInert(false)}>
                  {slots.Previous.Body}
                </div>
                <div className={styles.page}>{slots.Current.Body}</div>
                <div className={styles.page} {...pageInert(false)}>
                  {slots.Next.Body}
                </div>
              </div>
            </div>
            {nowMinute != null && (
              <div
                className={styles.now}
                style={{ '--now-at': `${nowMinute * pxPerMin}px` } as CSSProperties}
              >
                <span className={styles.nowDot} />
              </div>
            )}
          </div>
          {slots.Footer}
        </div>
      </section>
    )
  },
)
