import { Bell } from 'lucide-react'
import { hasReminders } from '../selectors'
import type { CalendarEvent } from '../types'

import styles from './Badges.module.css'

/** Compact badges shown on a block / chip. */
export function Badges({ event }: { event: CalendarEvent }) {
  return (
    <span className={styles.Badges}>
      {hasReminders(event) && <Bell className={styles.icon} aria-label="Reminders" />}
    </span>
  )
}
