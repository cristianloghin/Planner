import { Dialog } from 'radix-ui'
import { cx } from '../utils/cx'
import s from './ScopeSheet.module.css'

/** One reach an operation can have, with the occurrences it covers spelled out. */
export interface ScopeChoice {
  label: string
  /** Secondary line naming what the option reaches — "this" is ambiguous alone. */
  detail?: string
  onSelect: () => void
}

/**
 * Action sheet for choosing how far an operation on a recurring series reaches:
 * this one occurrence, or the whole series.
 *
 * Both saving and deleting ask the same question, so the chooser lives here
 * rather than inside either surface. `destructive` paints the options with
 * the danger token; such a sheet is itself the confirmation, so callers should
 * not stack a ConfirmDialog on top of it.
 */
export function ScopeSheet({
  open,
  onOpenChange,
  title,
  choices,
  destructive = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  choices: ScopeChoice[]
  destructive?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.card} aria-describedby={undefined}>
          <Dialog.Title className={s.title}>{title}</Dialog.Title>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              className={cx(s.option, destructive && s.danger)}
              onClick={c.onSelect}
            >
              {c.label}
              {c.detail && <span className={s.detail}>{c.detail}</span>}
            </button>
          ))}
          <Dialog.Close asChild>
            <button type="button" className={s.cancel}>
              Cancel
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
