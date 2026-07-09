import { AlertDialog } from 'radix-ui'
import { cx } from '../lib/cx'
import s from './Dialog.module.css'

/**
 * A styled, accessible confirmation dialog built on Radix AlertDialog. Replaces
 * ad-hoc `window.confirm` calls: it traps focus, closes on Escape, restores focus
 * to the trigger, locks background scroll, and announces itself to screen readers
 * — none of which the native confirm (or a hand-rolled overlay) does well.
 *
 * Controlled via `open`/`onOpenChange`. `destructive` paints the confirm button
 * with the danger token (delete flows).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={s.overlay} />
        <AlertDialog.Content className={s.content}>
          <AlertDialog.Title className={s.title}>{title}</AlertDialog.Title>
          {message && (
            <AlertDialog.Description className={s.message}>{message}</AlertDialog.Description>
          )}
          <div className={s.actions}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={cx(s.btn, s.cancel)}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={cx(s.btn, destructive && s.danger)}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
