import type { FC, PropsWithChildren } from 'react'
import { type ColorKey, colorStyle } from '../../../assets/palette'
import type { Person } from '../types'

import { cx } from '../../../assets/utils/cx'
import styles from './LaneHead.module.css'

/**
 * A person's column heading. Knows nothing about what fills it — the caller
 * drops that day's chips in as children — and takes its colour resolved,
 * because which colour a person shows in is a join with this user's settings.
 */
export const LaneHead: FC<
  PropsWithChildren<{
    person: Person
    color: ColorKey
    isCollapsed?: boolean
    isExpanded?: boolean
    onToggleLane?: () => void
  }>
> = ({ person, color, isCollapsed, isExpanded, onToggleLane, children }) => {
  if (isCollapsed) {
    return (
      <div className={cx(styles.LaneHead)} style={colorStyle(color)}>
        <div className={styles.name}>
          <span className={styles.dot} />
        </div>
        <div className={styles.chips}>{children}</div>
      </div>
    )
  }
  return (
    <div className={cx(styles.LaneHead)} style={colorStyle(color)}>
      <div className={styles.name}>
        <span className={styles.dot} />
        {onToggleLane ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={onToggleLane}
            aria-pressed={isExpanded}
            aria-label={isExpanded ? 'Restore equal lanes' : `Expand ${person.name}'s lane`}
          >
            {person.name}
          </button>
        ) : (
          person.name
        )}
      </div>
      <div className={styles.chips}>{children}</div>
    </div>
  )
}
