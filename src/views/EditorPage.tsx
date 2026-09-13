import { createComponentWithSlots } from '@mikrostack/rst'
import { ArrowLeft, Save } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import shared from '../assets/styles/shared.module.css'
import { cx } from '../assets/utils/cx'

import styles from './EditorPage.module.css'
import { Header } from './header/Header'

/**
 * A full-page editor: a fixed bar of actions — a back arrow on the left, a
 * short static title in the middle, whatever the route adds plus the primary
 * action (a save icon) on the right — over a scrolling body. With `onSubmit` the
 * page is a form and the save icon submits it; without, it is a plain page (a
 * sheet that saves as it goes). The labels are what a screen reader says for
 * the two icons.
 */
export const EditorPageView = createComponentWithSlots({
  Title: { isRequired: true },
  Actions: {},
  Body: { isRequired: true },
}).render<{
  onCancel: () => void
  cancelLabel?: string
  onSubmit?: () => void
  /** Label of the primary action; none means no primary action. */
  submitLabel?: string
}>(({ slots, onCancel, cancelLabel = 'Cancel', onSubmit, submitLabel }) => {
  const content: ReactNode = (
    <>
      <Header className={styles.head}>
        <Header.Left>
          <button
            type="button"
            className={shared.iconBtn}
            onClick={onCancel}
            aria-label={cancelLabel}
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        </Header.Left>
        <Header.Center.Title>{slots.Title}</Header.Center.Title>
        <Header.Right>
          {slots.Actions}
          {submitLabel && (
            <button
              type={onSubmit ? 'submit' : 'button'}
              className={cx(shared.iconBtn, shared.iconAccent)}
              onClick={onSubmit ? undefined : onCancel}
              aria-label={submitLabel}
            >
              <Save size={22} aria-hidden />
            </button>
          )}
        </Header.Right>
      </Header>
      <div className={styles.body}>{slots.Body}</div>
    </>
  )

  if (onSubmit) {
    return (
      <form
        className={styles.EditorPage}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        {content}
      </form>
    )
  }
  return <div className={styles.EditorPage}>{content}</div>
})
