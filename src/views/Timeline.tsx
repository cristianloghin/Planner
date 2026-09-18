import { createLayout, slot } from '@mikrostack/rst'
import { type CSSProperties, type MouseEvent, type ReactNode, useContext } from 'react'
import { cx } from '../assets/utils/cx'

import styles from './Timeline.module.css'
import { PageOverlayContext } from './pageOverlay'

interface TimelineViewProps {
  pxPerMin: number
}

const DAY_MIN = 24 * 60

/**
 * One day-long column: hour and quarter-hour lines, and a tap on empty space
 * that reports the minute under the finger. What sits on it is the caller's —
 * absolutely positioned children.
 */
function Column({
  highlight,
  onAddAt,
  children,
}: {
  /**
   * Minute of the day this column counts as "now" at; unset means the column
   * is not today. The column does not draw it: the timeline reads it back
   * and draws one line across every column that set it.
   */
  nowMin?: number
  /** Tint the column (today's, in a week). */
  highlight?: boolean
  onAddAt?: (minute: number) => void
  children?: ReactNode
}) {
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (!onAddAt) return
    // A tap on something placed in the column is that thing's, not ours.
    if ((e.target as HTMLElement).closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt(((e.clientY - rect.top) / rect.height) * DAY_MIN)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-on-empty-space is a pointer affordance to prefill the editor; the keyboard path is the header's + button
    <div className={cx(styles.column, highlight && styles.highlight)} onClick={handleClick}>
      {children}
    </div>
  )
}

/**
 * A day-long timeline of side-by-side columns — one per person on the Day
 * screen, one per weekday on the Week screen. The view knows nothing about
 * what a column is: it lays them out on the lane template the calendar view
 * publishes, sizes the day from the zoom, and draws the hour lines. Routes
 * fill each `Column` with blocks.
 *
 * The "now" line is the timeline's, not a column's: it reads which columns
 * were given a `nowMin` and draws one line from the first to the last of
 * them, so three people's columns on today share a line instead of each
 * drawing their own. The columns that are today are assumed contiguous,
 * which they are — all of them on the Day screen, one on the Week screen.
 * The line goes on the page's overlay rather than in the timeline itself:
 * its dot is centred on the line's left end, which for the first column is
 * the gutter's edge, where the page is clipped and the overlay is not.
 */
export const TimelineView = createLayout(
  {
    Column: slot({ component: Column, multiple: true }),
  },
  ({ pxPerMin }: TimelineViewProps, { slots }) => {
    const hourH = pxPerMin * 60
    const now = nowLineFor(slots.Column.props)
    const Overlay = useContext(PageOverlayContext)
    return (
      <div
        className={styles.Timeline}
        style={
          {
            height: DAY_MIN * pxPerMin,
            '--hour-h': `${hourH}px`,
            '--quarter-h': `${hourH / 4}px`,
          } as CSSProperties
        }
      >
        {slots.Column}
        {now && Overlay && (
          <Overlay>
            <div
              className={styles.nowLine}
              style={{ gridColumn: `${now.from} / ${now.to}`, top: now.min * pxPerMin }}
            >
              <span className={styles.nowDot} />
            </div>
          </Overlay>
        )}
      </div>
    )
  },
)

/**
 * Where the "now" line goes, from the columns' own say: the 1-based grid
 * lines it spans and the minute to draw it at. None when no column is today.
 */
function nowLineFor(columns: { nowMin?: number }[]) {
  const today = columns.flatMap((c, i) => (c.nowMin != null ? [{ i, min: c.nowMin }] : []))
  if (today.length === 0) return null
  return { from: today[0].i + 1, to: today[today.length - 1].i + 2, min: today[0].min }
}
