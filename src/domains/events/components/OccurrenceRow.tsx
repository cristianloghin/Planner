import type { ReactNode } from 'react'
import { type ColorKey, colorStyle } from '../../../assets/palette'
import { minutesToTime } from '../../../assets/utils/dates'
import type { DayOccurrence } from '../../../services/recurrence'

import styles from './OccurrenceRow.module.css'

/**
 * One occurrence as a row in a list: when it is, its title, and whatever the
 * caller appends after (attendee avatars). Takes its colour resolved: an
 * event with no colour of its own shows in a person's colour, and that is
 * the caller's join to make.
 */
export function OccurrenceRow({
  occ,
  color,
  onClick,
  children,
}: {
  occ: DayOccurrence
  color: ColorKey
  onClick: () => void
  children?: ReactNode
}) {
  const { event, segment } = occ
  let when: string
  if (!event.allDay) {
    when = `${minutesToTime(segment.start)}–${minutesToTime(segment.end)}`
  } else if (occ.span > 1) {
    when = `All day · ${occ.offset + 1}/${occ.span}`
  } else {
    when = 'All day'
  }
  return (
    <button
      type="button"
      className={styles.OccurrenceRow}
      style={colorStyle(color)}
      onClick={onClick}
    >
      <span className={styles.when}>{when}</span>
      <span className={styles.title}>{event.title}</span>
      {children}
    </button>
  )
}
