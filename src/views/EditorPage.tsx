import { createLayout, slot } from '@mikrostack/rst'
import { ArrowLeft, Save } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef } from 'react'

import { IconButton } from '../assets/ui/IconButton'
import { cx } from '../assets/utils/cx'
import styles from './EditorPage.module.css'
import { Header } from './header/Header'

interface EditorPageViewProps {
  onCancel: () => void
  cancelLabel?: string
  onSubmit?: () => void
  /** Label of the primary action; none means no primary action. */
  submitLabel?: string
  /** The primary action is shown but cannot be taken (nothing to save yet). */
  submitDisabled?: boolean
}

/**
 * Keeps the page as tall as the visual viewport while the soft keyboard is
 * up, so the page's bottom edge is the keyboard's top edge and a dock under
 * the body sits just above the keys.
 *
 * On iOS the keyboard shrinks the visual viewport, but whether it also
 * shrinks the layout viewport that `inset: 0` sizes against differs between
 * Safari and a home-screen app, and between iOS versions. The visual viewport
 * is the one value that reports the keyboard in every case, so the height is
 * taken from it, directly on the element, inside the viewport's own resize
 * event; where the layout viewport has already shrunk this is a no-op. With
 * the keyboard down the inline height is cleared and the stylesheet rules.
 * Nothing else moves: no transforms, no scroll corrections. The body is then
 * the real visible area, and whatever has the focus is revealed within it
 * once, since the scroller just changed size under it.
 *
 * The keyboard counts as up when the viewport is well below the tallest it
 * has been at this width — not below `innerHeight`, which shrinks along with
 * it in a home-screen app on iOS 26 and so would never report it.
 */
function useKeyboardHeight(root: { current: HTMLElement | null }) {
  useEffect(() => {
    const vv = window.visualViewport
    const el = root.current
    if (!vv || !el) return
    let width = vv.width
    let tallest = Math.max(vv.height, window.innerHeight)
    const update = () => {
      if (vv.width !== width) {
        // Rotated: what counts as tall starts over.
        width = vv.width
        tallest = 0
      }
      tallest = Math.max(tallest, vv.height)
      const keyboardUp = tallest - vv.height > 100
      el.style.height = keyboardUp ? `${vv.height}px` : ''
      el.classList.toggle(styles.keyboardUp, keyboardUp)
      const active = document.activeElement
      if (keyboardUp && active instanceof HTMLElement && el.contains(active)) {
        active.scrollIntoView({ block: 'nearest' })
      }
    }
    vv.addEventListener('resize', update)
    update()
    return () => vv.removeEventListener('resize', update)
  }, [root])
}

/**
 * A full-page editor: a fixed bar of actions — a back arrow on the left, a
 * short static title in the middle, whatever the route adds plus the primary
 * action (a save icon) on the right — over a scrolling body, and under the
 * body an optional dock: a bar in flow, for controls that must stay reachable
 * while the keyboard is up (a note's row toolbar). With `onSubmit` the page
 * is a form and the save icon submits it; without, it is a plain page (a
 * sheet that saves as it goes). The labels are what a screen reader says for
 * the two icons.
 *
 * Two of these on screen stack in document order, so a route can open one
 * over another (a note's own page over the event form).
 */
export const EditorPageView = createLayout(
  {
    Title: slot({ required: true }),
    Actions: slot(),
    Body: slot({ required: true }),
    Dock: slot(),
  },
  (
    {
      onCancel,
      cancelLabel = 'Cancel',
      onSubmit,
      submitLabel,
      submitDisabled,
    }: EditorPageViewProps,
    { slots },
  ) => {
    // The root is a form or a div depending on `onSubmit`; a callback ref
    // takes either.
    const root = useRef<HTMLElement | null>(null)
    const setRoot = (el: HTMLElement | null) => {
      root.current = el
    }
    useKeyboardHeight(root)

    const className = cx(styles.EditorPage, slots.Dock.filled && styles.hasDock)
    const content: ReactNode = (
      <>
        <Header className={styles.head}>
          <Header.Left>
            <IconButton onClick={onCancel} label={cancelLabel} icon={ArrowLeft} />
          </Header.Left>
          <Header.Center.Title>{slots.Title}</Header.Center.Title>
          <Header.Right>
            {slots.Actions}
            {submitLabel && (
              <IconButton
                type={onSubmit ? 'submit' : 'button'}
                accent
                onClick={onSubmit ? undefined : onCancel}
                disabled={submitDisabled}
                label={submitLabel}
                icon={Save}
              />
            )}
          </Header.Right>
        </Header>
        <div className={styles.body}>{slots.Body}</div>
        {slots.Dock.when((dock) => (
          <div className={styles.dock}>{dock}</div>
        ))}
      </>
    )

    if (onSubmit) {
      return (
        <form
          ref={setRoot}
          className={className}
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          {content}
        </form>
      )
    }
    return (
      <div ref={setRoot} className={className}>
        {content}
      </div>
    )
  },
)
