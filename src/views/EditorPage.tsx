import { createLayout, slot } from '@mikrostack/rst'
import { ArrowLeft, Save } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef } from 'react'

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
 * The viewport numbers the page is laid out from, printed while the gesture
 * readout is switched on (Settings). Reads only: nothing here sizes, moves or
 * scrolls anything.
 */
function useViewportReadout(readout: { current: HTMLPreElement | null }) {
  useEffect(() => {
    const out = readout.current
    const vv = window.visualViewport
    if (!out || !vv) return
    const root = document.documentElement
    const show = () => {
      out.textContent =
        `vv.top=${Math.round(vv.offsetTop)} vv.h=${Math.round(vv.height)} ` +
        `vv.w=${Math.round(vv.width)} scale=${vv.scale.toFixed(2)}\n` +
        `inner=${window.innerHeight} client=${root.clientHeight} ` +
        `kb=${root.hasAttribute('data-note-keyboard')} ` +
        `--note-vv-height=${root.style.getPropertyValue('--note-vv-height') || '(unset)'}`
    }
    vv.addEventListener('resize', show)
    vv.addEventListener('scroll', show)
    const observer = new MutationObserver(show)
    observer.observe(root, { attributes: true, attributeFilter: ['style', 'data-note-keyboard'] })
    show()
    return () => {
      vv.removeEventListener('resize', show)
      vv.removeEventListener('scroll', show)
      observer.disconnect()
    }
  }, [readout])
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
 * The keyboard is handled by layout, not by this view (EditorPage.module.css):
 * while a note editor is mounted the editor library publishes the visual
 * viewport as custom properties on the root, and the page is pinned to that
 * rectangle, so with the keyboard up its bottom edge is the keyboard's top
 * edge and the dock sits on it. The body scrolls with its overscroll
 * contained, so a drag scrolls the content instead of panning the viewport.
 * Nothing in JavaScript sizes, moves or scrolls the page.
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
    const readout = useRef<HTMLPreElement | null>(null)
    useViewportReadout(readout)

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
          <div className={styles.dock}>{bar}</div>
        ))}
        {isGestureDebugOn() && <pre ref={readout} className={styles.readout} />}
      </>
    )

    if (onSubmit) {
      return (
        <form
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
    return <div className={className}>{content}</div>
  },
)
