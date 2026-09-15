import type { ReactNode } from 'react'
import shared from '../styles/shared.module.css'
import { cx } from '../utils/cx'

/**
 * A bar button that is just an icon: a 44pt target with the icon centred and
 * the label read out rather than shown. `accent` marks the one primary action
 * in a bar; `danger` a destructive one.
 */
export function IconButton({
  label,
  onClick,
  accent,
  danger,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  accent?: boolean
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cx(shared.iconBtn, accent && shared.iconAccent, danger && shared.iconDanger)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  )
}
