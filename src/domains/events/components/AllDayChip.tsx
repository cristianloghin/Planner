import { type ColorKey, colorStyle } from '../../../assets/palette'
import type { DayOccurrence } from '../../../services/recurrence'
import { Badges } from './Badges'

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
}: {
  occ: DayOccurrence
  color: ColorKey
  onClick: () => void
}) => {
  const { event } = occ
  return (
    <button type="button" className={styles.AllDayChip} style={colorStyle(color)} onClick={onClick}>
      <span className={styles.meta}>
        <Badges event={event} />
      </span>
      <span className={styles.title}>{event.title}</span>
      {occ.span > 1 && <span className={styles.offset}>{`${occ.offset + 1}/${occ.span}`}</span>}
    </button>
  )
}
