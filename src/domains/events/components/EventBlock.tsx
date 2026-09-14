import type { ReactNode } from 'react'
import { type ColorKey, colorStyle } from '../../../assets/palette'
import { cx } from '../../../assets/utils/cx'
import { minutesToTime } from '../../../assets/utils/dates'
import type { DayOccurrence } from '../../../services/recurrence'
import { Badges } from './Badges'

import styles from './EventBlock.module.css'

// A dense bar needs this many pixels before its title renders at all.
const TITLE_MIN_PX = 18

/**
 * One timed occurrence as a block on a timeline. It places itself from its
 * time and the column the layout gave it (`col` of `cols` side by side, for
 * overlaps); its colour is resolved by the caller, because an event with no
 * colour of its own shows in its lane's.
 *
 * `dense` is the week's look: tighter, title only, and only when the bar is
 * tall enough to fit one. Children (attendee avatars) render after the title.
 */
export function EventBlock({
  occ,
  color,
  pxPerMin,
  col = 0,
  cols = 1,
  dense,
  showTitle = true,
  onClick,
  children,
}: {
  occ: DayOccurrence
  color: ColorKey
  pxPerMin: number
  col?: number
  cols?: number
  dense?: boolean
  showTitle?: boolean
  onClick: () => void
  children?: ReactNode
}) {
  const { event } = occ
  const { start, end } = occ.segment
  const range = `${minutesToTime(start)}–${minutesToTime(end)}`
  // Never thinner than a legible line; dense bars hug their neighbours closer.
  const height = Math.max((end - start) * pxPerMin, dense ? 12 : 16)
  const inset = dense ? 1 : 2

  return (
    <button
      type="button"
      className={cx(styles.EventBlock, dense && styles.dense)}
      style={{
        top: start * pxPerMin,
        height,
        left: `calc(${(100 / cols) * col}% + ${inset}px)`,
        width: `calc(${100 / cols}% - ${inset * 2}px)`,
        ...colorStyle(color),
      }}
      onClick={onClick}
      title={dense ? event.title : undefined}
      aria-label={dense ? `${event.title}, ${range}` : undefined}
    >
      <span className={styles.overlay} style={{ top: height - 12, ...colorStyle(color) }} />
      {showTitle && (!dense || height >= TITLE_MIN_PX) && (
        <span className={styles.title}>{event.title}</span>
      )}
      {!dense && (
        <span className={styles.time}>
          {range}
          {occ.moved && (
            <span className={styles.tag} aria-label="Moved from another day">
              {' '}
              ↔ moved
            </span>
          )}
          <Badges event={event} />
        </span>
      )}
      {children}
    </button>
  )
}
