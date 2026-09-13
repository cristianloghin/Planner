import { type ColorKey, colorStyle } from '../../../assets/palette'
import type { Person } from '../types'

import styles from './Avatars.module.css'

/**
 * A row of small round initials, one per attendee, in each person's colour.
 * Takes the people resolved with their colours; the caller makes that join.
 */
export function Avatars({
  attendees,
}: {
  attendees: { person: Person; color: ColorKey }[]
}) {
  if (attendees.length === 0) return null
  return (
    <span className={styles.Avatars}>
      {attendees.map(({ person, color }) => (
        <span
          key={person.id}
          className={styles.avatar}
          style={colorStyle(color)}
          title={person.name}
        >
          {person.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  )
}
