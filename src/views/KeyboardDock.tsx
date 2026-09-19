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
        const keyboardUp = window.innerHeight - vv.height > 100
        // With the keyboard up the bar's bottom edge is the keyboard's top,
        // so the home-indicator inset is behind the keyboard and not needed.
        el.style.paddingBottom = keyboardUp ? '6px' : ''

        // Where the keyboard's top edge is, in the coordinates the bar's box
        // is measured in. iOS scrolls the document to reveal a focused field
        // under the keyboard, even with nothing else able to scroll it, and
        // then reports that scroll in `offsetTop` as well as `scrollY`; the
        // visual viewport's real offset within the layout viewport is the
        // difference. Measured on iOS 18, scrolled and not.
        const pan = vv.offsetTop - window.scrollY
        const target = pan + vv.height

        // Move the bar by however far its resting box sits below that edge.
        // Measured rather than computed from `innerHeight`, because where a
        // fixed `bottom: 0` actually lands while the keyboard is up is not
        // something iOS reports consistently.
        el.style.transform = ''
        const shift = el.getBoundingClientRect().bottom - target
        el.style.transform = shift > 0 ? `translateY(-${shift}px)` : ''
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
