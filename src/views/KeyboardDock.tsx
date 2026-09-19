import { createLayout, slot } from '@mikrostack/rst'
import { useEffect, useRef } from 'react'
import styles from './KeyboardDock.module.css'

/**
 * A bar pinned to the bottom of the screen that rides up with the soft
 * keyboard. A fixed element sits under the keyboard on phones; the visual
 * viewport says how much of the screen the keyboard has taken, and the bar
 * is moved up by that much. The layout owns the element and the tracking;
 * the route only fills the bar.
 */
export const KeyboardDockView = createLayout(
  { Bar: slot({ required: true }) },
  (_props: Record<never, never>, { slots }) => {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const vv = window.visualViewport
      const el = ref.current
      if (!vv || !el) return
      const update = () => {
        // From the layout viewport's bottom edge up to the keyboard's top.
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        el.style.transform = inset > 0 ? `translateY(-${inset}px)` : ''
        el.classList.toggle(styles.keyboardOpen, window.innerHeight - vv.height > 100)
      }
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      update()
      return () => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }, [])

    return (
      <div ref={ref} className={styles.KeyboardDock}>
        {slots.Bar}
      </div>
    )
  },
)
