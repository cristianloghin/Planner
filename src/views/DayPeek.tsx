import { createLayout, slot } from '@mikrostack/rst'
import { ChevronRight, Plus } from 'lucide-react'

import { IconButton } from '../assets/ui/IconButton'
import styles from './DayPeek.module.css'

interface DayPeekViewProps {
  onOpen: () => void
  openLabel: string
  onCreate: () => void
  newLabel: string
}

/**
 * A day's overview under a month grid: its name, an arrow that opens the
 * day itself, and a list of whatever the route drops in as `Row`s — an empty
 * day says so. Which day, and what a row is, are the route's business.
 */
export const DayPeekView = createLayout(
  {
    Title: slot({ required: true }),
    Row: slot({
      multiple: true,
      fallback: <p className={styles.empty}>Nothing planned</p>,
    }),
  },
  ({ onOpen, onCreate, openLabel, newLabel }: DayPeekViewProps, { slots }) => (
    <section className={styles.DayPeek}>
      <header className={styles.head}>
        <span className={styles.day}>
          <span className={styles.title}>{slots.Title}</span>
          <IconButton onClick={onOpen} label={openLabel} icon={ChevronRight} />
        </span>
        <IconButton onClick={onCreate} label={newLabel} icon={Plus} />
      </header>
      <div className={styles.rows}>{slots.Row}</div>
    </section>
  ),
)
