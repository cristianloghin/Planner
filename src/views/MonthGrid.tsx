import { createLayout, slot } from '@mikrostack/rst'
import { Fragment } from 'react'
import { type ColorKey, colorStyle } from '../assets/palette'
import { cx } from '../assets/utils/cx'

import styles from './MonthGrid.module.css'

/** The week-number badge that leads each row. */
function WeekNumber({ week }: { week: number }) {
  return <span className={styles.weekNumber}>{week}</span>
}

/**
 * One day of the grid: the date, a full-width bar per all-day thing in its
 * colour, then a dot per timed thing and "+N" past `maxDots`. Dimmed outside
 * the visible month, ringed on today, filled when selected.
 */
function Cell({
  date,
  bars = [],
  dots,
  maxDots = 4,
  dim,
  isToday,
  selected,
  label,
  onClick,
}: {
  date: number
  /** Colours of the day's all-day occurrences, drawn as bars. */
  bars?: ColorKey[]
  /** Colours of the day's timed occurrences, drawn as dots. */
  dots: ColorKey[]
  maxDots?: number
  dim?: boolean
  isToday?: boolean
  selected?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cx(
        styles.cell,
        dim && styles.dim,
        isToday && styles.today,
        selected && styles.selected,
      )}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
    >
      <span className={styles.date}>{date}</span>
      {bars.length > 0 && (
        <span className={styles.bars}>
          {bars.map((color, i) => (
            <span
              // Bars have no identity beyond their position.
              key={`${i}:${color}`}
              className={styles.bar}
              style={colorStyle(color)}
            />
          ))}
        </span>
      )}
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
export const MonthGridView = createLayout(
  {
    WeekNumber: slot({ component: WeekNumber, multiple: true }),
    Cell: slot({ component: Cell, multiple: true }),
  },
  (_, { slots }) => {
    const rows: (typeof slots.Cell.elements)[] = []
    for (let i = 0; i < slots.Cell.elements.length; i += 7) {
      rows.push(slots.Cell.elements.slice(i, i + 7))
    }

    return (
      <div className={styles.MonthGrid}>
        {rows.map((cells, r) => (
          <Fragment key={slots.WeekNumber.props[r].week}>
            {slots.WeekNumber.elements[r]}
            {cells}
          </Fragment>
        ))}
      </div>
    )
  },
)
