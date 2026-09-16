import type { LucideIcon } from 'lucide-react'
import { cx } from '../utils/cx'
import s from './IconButton.module.css'

interface IconButtonProps {
  type?: 'button' | 'submit'
  label: string
  onClick?: () => void
  active?: boolean
  small?: boolean
  accent?: boolean
  danger?: boolean
  disabled?: boolean
  icon: LucideIcon
}

/**
 * A bar button that is just an icon: a 44pt target with the icon centred and
 * the label read out rather than shown. `accent` marks the one primary action
 * in a bar; `danger` a destructive one.
 */
export function IconButton({
  type = 'button',
  label,
  onClick,
  active,
  accent,
  danger,
  disabled,
  small = false,
  icon: Icon,
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        s.iconBtn,
        small && s.small,
        active && s.active,
        accent && s.iconAccent,
        danger && s.iconDanger,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span className={s.iconWrapper}>
        <Icon size={small ? 20 : 24} />
      </span>
    </button>
  )
}
