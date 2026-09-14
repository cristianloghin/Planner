import type { ReactNode } from 'react'
import { cx } from '../utils/cx'
import styles from './DayHead.module.css'

/**
 * A weekday's column heading: the day name, its number when given, today
 * ringed in accent, with whatever the caller drops underneath (all-day
 * chips). With `onToggle` the label is a button that expands that column, or
 * restores equal columns if it already is; without it, a plain label.
 */
export function DayHead({
  name,
  number,
  isToday,
  isExpanded,
  onToggle,
  children,
}: {
  name: string
  number?: number
  isToday?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const containerClass = cx(styles.container, isToday && styles.today)
  const label = (
    <>
      <span className={styles.name}>{name}</span>
      {number != null && <span className={styles.number}>{number}</span>}
    </>
  )
  return (
    <div className={cx(styles.DayHead)}>
      <div className={containerClass}>
        {onToggle ? (
          <button
            type="button"
            className={styles.label}
            onClick={onToggle}
            aria-pressed={isExpanded}
            aria-label={isExpanded ? 'Restore equal day columns' : `Expand ${name}'s column`}
          >
            {label}
          </button>
        ) : (
          <div className={styles.label}>{label}</div>
        )}
        {children != null && <div className={styles.chips}>{children}</div>}
      </div>
    </div>
  )
}
