import { createLayout, slot } from '@mikrostack/rst'
import { ArrowLeft, Save } from 'lucide-react'
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef } from 'react'

import { IconButton } from '../assets/ui/IconButton'
import { cx } from '../assets/utils/cx'
import { isGestureDebugOn } from '../services/gestures/debug'
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
 * Set on the page while the keyboard is up: how much of the page's height
 * the keyboard can cover. The body pads its bottom by it so its last rows can
 * scroll clear, and reveals within that (scroll-padding).
 */
const INSET_PROPERTY = '--keyboard-inset'

/**
 * Keeps the dock on the soft keyboard's top edge, and the body able to scroll
 * clear of both.
 *
 * On iOS the keyboard shrinks the visual viewport but not the layout viewport
 * the page fills: the page keeps its height, its bottom goes behind the
 * keyboard, and iOS pans the visual viewport down inside the page to reveal
 * the focused field. So the keyboard's top edge, in the page's own
 * coordinates, is the visual viewport's offset plus its height, and the dock
 * — in flow at the page's bottom — is translated up by what the page has
 * below that edge. That is the only thing that moves, and it moves on every
 * viewport event; worst case a flutter twitches the bar, never the content.
 * Where the layout viewport does shrink with the keyboard the shift comes
 * out as zero and the bar is simply where the stylesheet put it.
 *
 * Everything else is settled once per resize: the inset the body pads by
 * (the keyboard's full height — the most it can cover, whatever the pan),
 * the keyboard-up class, and one reveal of whatever has the focus, since
 * the body's usable height just changed under it. No measuring of boxes,
 * no scroll corrections from inside viewport events.
 *
 * The keyboard counts as up when the viewport is well below the tallest it
 * has been at this width — not below `innerHeight`, which can shrink with
 * the keyboard in a home-screen app and would then never report it.
 */
function useKeyboardDock(
  root: RefObject<HTMLElement | null>,
  dock: RefObject<HTMLDivElement | null>,
  readout: RefObject<HTMLPreElement | null>,
) {
  useEffect(() => {
    const vv = window.visualViewport
    const el = root.current
    if (!vv || !el) return
    let width = vv.width
    let tallest = Math.max(vv.height, window.innerHeight)
    let keyboardUp = false

    // How far the page's bottom edge sits below the keyboard's top edge.
    const covered = () => Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)))

    const show = () => {
      const out = readout.current
      if (!out) return
      out.textContent =
        `inner=${window.innerHeight} vv.h=${Math.round(vv.height)} vv.top=${Math.round(vv.offsetTop)} ` +
        `pageTop=${Math.round(vv.pageTop)} scrollY=${Math.round(window.scrollY)}\n` +
        `shift=${covered()} inset=${el.style.getPropertyValue(INSET_PROPERTY) || '0px'} ` +
        `kb=${keyboardUp} tallest=${Math.round(tallest)} page.h=${el.clientHeight}`
    }
    const place = () => {
      const bar = dock.current
      if (!bar) return
      const shift = covered()
      bar.style.transform = shift > 0 ? `translateY(-${shift}px)` : ''
    }
    const resize = () => {
      if (vv.width !== width) {
        // Rotated: what counts as tall starts over.
        width = vv.width
        tallest = 0
      }
      tallest = Math.max(tallest, vv.height)
      keyboardUp = tallest - vv.height > 100
      el.classList.toggle(styles.keyboardUp, keyboardUp)
      const inset = keyboardUp ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0
      el.style.setProperty(INSET_PROPERTY, `${inset}px`)
      place()
      const active = document.activeElement
      if (keyboardUp && active instanceof HTMLElement && el.contains(active)) {
        active.scrollIntoView({ block: 'nearest' })
      }
      show()
    }
    const scroll = () => {
      place()
      show()
    }
    vv.addEventListener('resize', resize)
    vv.addEventListener('scroll', scroll)
    resize()
    return () => {
      vv.removeEventListener('resize', resize)
      vv.removeEventListener('scroll', scroll)
    }
  }, [root, dock, readout])
}

/**
 * A full-page editor: a fixed bar of actions — a back arrow on the left, a
 * short static title in the middle, whatever the route adds plus the primary
 * action (a save icon) on the right — over a scrolling body, and under the
 * body an optional dock: a bar for controls that must stay reachable while
 * the keyboard is up (a note's row toolbar), kept on the keyboard's edge by
 * the view. With `onSubmit` the page is a form and the save icon submits it;
 * without, it is a plain page (a sheet that saves as it goes). The labels
 * are what a screen reader says for the two icons.
 *
 * Two of these on screen stack in document order, so a route can open one
 * over another (a note's own page over the event form).
 *
 * With the gesture readout switched on (Settings), the page shows the
 * viewport numbers the dock is placed from, for chasing keyboard trouble on
 * a phone.
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
    const dock = useRef<HTMLDivElement | null>(null)
    const readout = useRef<HTMLPreElement | null>(null)
    useKeyboardDock(root, dock, readout)

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
        {slots.Dock.when((bar) => (
          <div ref={dock} className={styles.dock}>
            {bar}
          </div>
        ))}
        {isGestureDebugOn() && <pre ref={readout} className={styles.readout} />}
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
