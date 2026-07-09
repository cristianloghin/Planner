import { Calendar } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import { EventSearch } from './EventSearch'

/**
 * The three-slot header shared by the Day, Week and Month views: event search
 * on the left, the prev/label/next nav in the middle, and a "jump to today"
 * button on the right. `rightExtra` parks any view-specific badges (e.g. the
 * Day view's conflict warning) just left of the today button. `children` render
 * below the nav row, still inside the bordered head (the Day view's lane names).
 */
export function ViewHeader({
  nav,
  onToday,
  todayActive,
  onPickSearch,
  rightExtra,
  children,
}: {
  nav: ReactNode
  onToday: () => void
  todayActive: boolean
  onPickSearch: (seriesId: string) => void
  rightExtra?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={shared.viewHead}>
      <div className={shared.viewHeadContainer}>
        <div className={shared.headSide}>
          <EventSearch onPick={onPickSearch} />
        </div>
        {nav}
        <div className={shared.headSide}>
          {rightExtra}
          <button
            type="button"
            className={cx(shared.todayBtn, todayActive && shared.todayActive)}
            onClick={onToday}
            aria-label="Go to today"
          >
            <Calendar size={18} />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}
