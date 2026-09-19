import { createLayout, slot } from '@mikrostack/rst'
import { useEffect, useRef } from 'react'
import styles from './KeyboardDock.module.css'

/**
 * Set on the document while a dock is shown: the height of the screen's
 * bottom that the keyboard and the bar together cover. A page's scroller
 * pads its bottom by it so the content above can scroll clear.
 */
const INSET_PROPERTY = '--keyboard-inset'

/** The nearest ancestor that scrolls vertically, if any. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
  }
  return null
}

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
      const root = document.documentElement
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

        // How much of the screen's bottom the keyboard and the bar cover,
        // published for scrollers to pad by — a page whose content fits its
        // box has nothing to scroll otherwise, and a field under the bar
        // stays there (views/EditorPage reads it).
        root.style.setProperty(INSET_PROPERTY, `${Math.max(0, shift) + el.offsetHeight}px`)

        // Then whatever has the focus is brought clear of the bar, within
        // its own scroller, by however much the bar covers it.
        const active = document.activeElement
        if (active instanceof HTMLElement && active !== document.body) {
          const covered = active.getBoundingClientRect().bottom - el.getBoundingClientRect().top
          if (covered > 0) scrollParent(active)?.scrollBy({ top: covered + 8 })
        }
      }
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      update()
      return () => {
        root.style.removeProperty(INSET_PROPERTY)
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
