import { createComponentWithSlots } from '@mikrostack/rst'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { cx } from '../assets/utils/cx'

import styles from './Timeline.module.css'

const DAY_MIN = 24 * 60

/**
 * One day-long column: hour and quarter-hour lines, an optional "now" line,
 * and a tap on empty space that reports the minute under the finger. What
 * sits on it is the caller's — absolutely positioned children.
 */
function Column({
  nowMin,
  highlight,
  onAddAt,
  children,
}: {
  /** Minute of the day to draw the "now" line at; unset draws none. */
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
      {nowMin != null && (
        <div className={styles.nowLine} style={{ top: `${(nowMin / DAY_MIN) * 100}%` }}>
          <span className={styles.nowDot} />
        </div>
      )}
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
 */
export const TimelineView = createComponentWithSlots({
  Column: { component: Column, multiple: true },
}).render<{ pxPerMin: number }>(({ slots, pxPerMin }) => {
  const hourH = pxPerMin * 60
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
    </div>
  )
})
