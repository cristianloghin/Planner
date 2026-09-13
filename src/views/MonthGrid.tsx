import { createComponentWithSlots } from '@mikrostack/rst'
import { Fragment } from 'react'
import { type ColorKey, colorStyle } from '../assets/palette'
import { cx } from '../assets/utils/cx'

import styles from './MonthGrid.module.css'

/** The week-number badge that leads each row. */
function WeekNumber({ week }: { week: number }) {
  return <span className={styles.weekNumber}>{week}</span>
}

/**
 * One day of the grid: the date, a dot per thing on that day in its colour,
 * and "+N" past `maxDots`. Dimmed outside the visible month, ringed on today.
 */
function Cell({
  date,
  dots,
  maxDots = 4,
  dim,
  isToday,
  label,
  onClick,
}: {
  date: number
  dots: ColorKey[]
  maxDots?: number
  dim?: boolean
  isToday?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cx(styles.cell, dim && styles.dim, isToday && styles.today)}
      onClick={onClick}
      aria-label={label}
    >
      <span className={styles.date}>{date}</span>
      {dots.length > 0 && (
        <span className={styles.dots}>
          {dots.slice(0, maxDots).map((color, i) => (
            <span
              // Dots have no identity beyond their position.
              key={`${i}:${color}`}
              className={styles.dot}
              style={colorStyle(color)}
            />
          ))}
          {dots.length > maxDots && <span className={styles.more}>+{dots.length - maxDots}</span>}
        </span>
      )}
    </button>
  )
}

/**
 * A month as rows of seven cells, each row led by its week number. The route
 * gives the cells in date order and one `WeekNumber` per row; the view does
 * the interleaving, because "a week is a row" is layout, not data. The
 * leading column is the gutter token wide, so it lines up under the calendar
 * view's lane row.
 */
export const MonthGridView = createComponentWithSlots({
  WeekNumber: { component: WeekNumber, multiple: true },
  Cell: { component: Cell, multiple: true },
}).render(({ slots }) => {
  const rows: (typeof slots.Cell)[] = []
  for (let i = 0; i < slots.Cell.length; i += 7) {
    rows.push(slots.Cell.slice(i, i + 7))
  }
  return (
    <div className={styles.MonthGrid}>
      {rows.map((cells, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a row has no identity beyond its position; the cells inside carry their own
        <Fragment key={r}>
          {slots.WeekNumber[r]}
          {cells}
        </Fragment>
      ))}
    </div>
  )
})
