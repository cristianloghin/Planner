import { cx } from '../../../assets/utils/cx'
import type { Divergence } from '../../../services/recurrence'

import styles from './ChangedMark.module.css'

const LABELS: Record<Divergence, string> = {
  timing: 'Time changed on this day',
  people: 'Different people on this day',
  both: 'Time and people changed on this day',
}

/** What a mark says, for callers that put it in a box's own accessible name. */
export function changedLabel(differs: Divergence): string {
  return LABELS[differs]
}

/**
 * The corner notch that marks a day as not as its series: moved, resized or
 * with its own people. One shape wherever an occurrence is drawn as a box, so
 * it is learnt once — a spreadsheet's "there is more here" triangle, small
 * enough for the week's thinnest bar.
 *
 * Drawn in the box's own colour (`--c`), so it reads as part of the thing
 * rather than as a second thing on the day. `inverse` is for a solid box,
 * where the colour would vanish into its background. The box positions it:
 * it must be `position: relative` or absolute itself.
 */
export function ChangedMark({
  differs,
  inverse = false,
}: {
  differs: Divergence
  inverse?: boolean
}) {
  return (
    <span
      className={cx(styles.ChangedMark, inverse && styles.inverse)}
      role="img"
      aria-label={LABELS[differs]}
      title={LABELS[differs]}
    />
  )
}
