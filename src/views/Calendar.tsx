import { createLayout, slot } from '@mikrostack/rst'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'
import { useLatest } from '../assets/hooks/useLatest'
import { cx } from '../assets/utils/cx'
import { type SwipeZoom, pageInert, useSwipeGestures } from '../services/gestures'

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
}

/** The column template for lanes with the given relative widths. */
function laneColumns(weights: number[]): string {
  return weights.map((w) => `minmax(0, ${w}fr)`).join(' ')
}

/** One lane head. `weight` is its relative width: an expanded lane is wider. */
function LaneSlot({ children }: { weight?: number; children?: ReactNode }) {
  return <>{children}</>
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
          <button type="button" onClick={() => onNavigate(-1)} aria-label="Previous">
            <ChevronLeft size={20} />
          </button>
          <strong>{title}</strong>
          <button type="button" onClick={() => onNavigate(1)} aria-label="Next">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className={styles.headSide}>
          <button
            type="button"
            className={cx(styles.todayBtn, todayActive && styles.todayActive)}
            onClick={onGoToday}
            aria-label="Go to today"
          >
            <Calendar size={18} />
          </button>
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
 * frame. The header's lane row and whatever the pages draw both read it, so
 * head and body agree without either being told.
 *
 * The deck is the view's: it owns the scroller, the strip and the gesture
 * that slides between `Previous`, `Current` and `Next`. It never knows what a
 * page shows. When a swipe commits it calls `onNavigate`, the route moves its
 * date and re-renders all three pages, and `pageKey` changing is how the deck
 * knows the new page has landed so it can recentre before paint. The arrows
 * fire the same `onNavigate`, so a route names the intent once.
 *
 * Zoom is lent by the route, because pinch and swipe share one gesture
 * binding but the zoom key is per screen and the month has none.
 *
 * A page is whatever the route drops in — a `TimelineView` of columns, a
 * `MonthGridView` of cells. The lane template is inherited by anything inside.
 */
export const CalendarView = createLayout(
  {
    Header: {
      Title: slot({ required: true }),
      Search: slot(),
      Lane: slot({ component: LaneSlot, multiple: true }),
    },

    Gutter: slot(),
    Previous: slot({ required: true }),
    Current: slot({ required: true }),
    Next: slot({ required: true }),
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
    }: CalendarViewProps,
    { slots },
  ) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stripRef = useRef<HTMLDivElement>(null)
    // Mirror for scrollToMinute, which mount effects call with a stale closure.
    const pxPerMinRef = useLatest((zoom?.hourH ?? 60) / 60)

    const { onClickCapture } = useSwipeGestures({
      scrollRef,
      stripRef,
      pageKey,
      onNavigate,
      zoom,
    })

    // Scroll the timeline so `minute` sits a little below the top edge.
    function scrollToMinute(minute: number) {
      const el = scrollRef.current
      if (el) el.scrollTop = Math.max(0, minute * pxPerMinRef.current - 80)
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
    useEffect(() => {
      if (initialMinute != null) scrollToMinute(initialMinute)
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

    return (
      <section
        className={styles.CalendarView}
        style={{ '--lane-columns': laneColumns(weights) } as CSSProperties}
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
          <div className={styles.grid}>
            {slots.Gutter.filled && <div className={styles.gutter}>{slots.Gutter}</div>}
            {/* The gutter stays put; only the pages slide during a swipe. */}
            <div className={styles.clip}>
              <div className={styles.strip} ref={stripRef}>
                <div className={styles.page} {...pageInert(false)}>
                  {slots.Previous}
                </div>
                <div className={styles.page}>{slots.Current}</div>
                <div className={styles.page} {...pageInert(false)}>
                  {slots.Next}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  },
)
