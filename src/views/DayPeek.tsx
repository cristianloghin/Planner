import { createLayout, slot } from '@mikrostack/rst'
import { ChevronRight } from 'lucide-react'

import styles from './DayPeek.module.css'

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
  ({ onOpen, openLabel }: { onOpen: () => void; openLabel: string }, { slots }) => (
    <section className={styles.DayPeek}>
      <header className={styles.head}>
        <strong className={styles.title}>{slots.Title}</strong>
        <button type="button" className={styles.open} onClick={onOpen} aria-label={openLabel}>
          <ChevronRight size={24} />
        </button>
      </header>
      <div className={styles.rows}>{slots.Row}</div>
    </section>
  ),
)
