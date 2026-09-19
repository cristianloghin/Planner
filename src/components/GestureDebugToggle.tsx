import shared from '../assets/styles/shared.module.css'

import styles from './GestureDebugToggle.module.css'

/**
 * A switch for the gesture readout on the calendar screens: what the browser
 * saw of every touch and whether the page scrolled. For chasing a scroller
 * that stops responding on a phone. Told its state; the route stores it.
 */
export function GestureDebugToggle({
  on,
  onToggle,
}: { on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className={styles.GestureDebugToggle}>
      <span className={styles.hint}>
        Troubleshooting — show a live readout of touches and scrolling over the Day, Week and Month
        screens. Turn it on if the calendar stops scrolling, then open a calendar screen and try
        again; the readout shows what the browser did with each swipe.
      </span>
      <label className={shared.toggle}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        Gesture readout on calendar screens
      </label>
    </div>
  )
}
