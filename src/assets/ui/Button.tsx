import type { ReactNode } from 'react'

import { cx } from '../utils/cx'
import s from './Button.module.css'

interface ButtonProps {
  type?: 'button' | 'submit'
  className?: string
  onClick?: () => void
  label: string
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}

export function Button({
  type = 'button',
  className,
  primary,
  danger,
  disabled,
  onClick,
  label,
  children,
}: ButtonProps) {
  return (
    <button
      className={cx(s.button, className, primary && s.primary, danger && s.danger)}
      type={type}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
    >
      <span className={s.wrapper}>{children}</span>
    </button>
  )
}
