import type { FC } from 'react'
import { type ColorKey, colorStyle } from '../../../assets/palette'
import type { Person } from '../types'

import { cx } from '../../../assets/utils/cx'
import styles from './LaneHead.module.css'

/**
 * A person's column heading: the name, in that person's colour, doubling as
 * the toggle that expands the lane. Takes its colour resolved, because which
 * colour a person shows in is a join with this user's settings.
 */
export const LaneHead: FC<{
  person: Person
  color: ColorKey
  isCollapsed?: boolean
  isExpanded?: boolean
  onToggleLane?: () => void
}> = ({ person, color, isCollapsed, isExpanded, onToggleLane }) => {
  const name = isCollapsed ? person.name.charAt(0).toUpperCase() : person.name

  return (
    <div className={cx(styles.LaneHead)} style={colorStyle(color)} data-expanded={isExpanded}>
      <div className={styles.name}>
        {onToggleLane ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={onToggleLane}
            aria-pressed={isExpanded}
            aria-label={isExpanded ? 'Restore equal lanes' : `Expand ${person.name}'s lane`}
          >
            {name}
          </button>
        ) : (
          name
        )}
      </div>
    </div>
  )
}
