import { type ColorKey, colorStyle } from '../../../assets/palette'
import { cx } from '../../../assets/utils/cx'
import type { DayOccurrence } from '../../../services/recurrence'
import { ChangedMark } from './ChangedMark'

import styles from './AllDayChip.module.css'

/**
 * One all-day occurrence as a chip. Takes its colour resolved: an event with
 * no colour of its own shows in its lane's colour, and that is the caller's
 * join to make.
 */
export const AllDayChip = ({
  occ,
  color,
  onClick,
  isCollapsed,
}: {
  occ: DayOccurrence
  color: ColorKey
  onClick: () => void
  isCollapsed?: boolean
}) => {
  const { event, differs } = occ
  return (
    <button
      type="button"
      className={cx(styles.AllDayChip, differs && styles.changed)}
      style={colorStyle(color)}
      onClick={onClick}
    >
      {/* The chip is solid in its colour, so the mark is drawn in white. */}
      {differs && <ChangedMark differs={differs} inverse />}
      {!isCollapsed && <span className={styles.title}>{event.title}</span>}
      {occ.span > 1 && <span className={styles.offset}>{`${occ.offset + 1}/${occ.span}`}</span>}
    </button>
  )
}
