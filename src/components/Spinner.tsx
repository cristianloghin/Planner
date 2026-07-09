import { cx } from '../lib/cx'
import s from './Spinner.module.css'

/** Small indeterminate ring. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx(s.ring, className)}
      style={{ '--spinner-size': `${size}px` } as React.CSSProperties}
      role="status"
      aria-label="Loading"
    />
  )
}

/** Centred spinner + label for a whole region (app boot, a full-page editor). */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className={s.page}>
      <Spinner size={28} />
      {label && <span>{label}</span>}
    </div>
  )
}

/**
 * Floating "background work" indicator, fixed above the tab bar. For window
 * fetches that refine an already-usable view (e.g. a cold completions month),
 * where blanking the content would be worse than briefly showing it bare.
 */
export function LoadingPill({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={s.pill} role="status">
      <Spinner size={13} />
      {label}
    </div>
  )
}
