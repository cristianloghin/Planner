import { useEffect, useState } from 'react'

/**
 * Clamp `n` into the inclusive `[min, max]` range (either bound optional).
 * Pure + exported so the coercion rule is unit-testable.
 */
export function clampNumber(n: number, min?: number, max?: number): number {
  if (min != null) n = Math.max(min, n)
  if (max != null) n = Math.min(max, n)
  return n
}

/**
 * Normalize the raw text of a number field into a valid number: empty or
 * non-numeric input falls back to `fallback` (or `min`, or 0), then the result
 * is clamped. Used on blur/submit — never mid-keystroke.
 */
export function normalizeNumber(
  text: string,
  { min, max, fallback }: { min?: number; max?: number; fallback?: number },
): number {
  const n = Number(text)
  const base = text.trim() === '' || !Number.isFinite(n) ? (fallback ?? min ?? 0) : n
  return clampNumber(base, min, max)
}

type Props = {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  /** Value used when the field is left empty/invalid; defaults to `min` (or 0). */
  fallback?: number
  className?: string
}

/**
 * A controlled numeric input that you can actually clear and retype.
 *
 * The naive `value={n}` + `onChange={setN(coerce(...))}` pattern coerces on every
 * keystroke, so clearing the box instantly snaps back to the min — making it
 * impossible to type a new number on mobile. Here the field owns a transient
 * string while focused (so it may be empty or half-typed), the parent only sees
 * valid numbers, and the value is normalized + clamped on blur.
 *
 * `min`/`max` are still set as attributes (spinner + a11y), but correctness lives
 * in the blur handler, not the native constraints.
 */
export function NumberField({ value, onChange, min, max, step, fallback, className }: Props) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  // Reflect external changes (e.g. switching all-day on/off resets duration)
  // unless the user is actively editing the field.
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  return (
    <input
      type="number"
      inputMode="numeric"
      className={className}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => {
        setFocused(true)
        setText(String(value))
      }}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        // Emit only a genuinely-typed number, capped at max so you can't exceed
        // it; the min is enforced on blur so you can still clear and retype.
        const n = Number(t)
        if (t.trim() !== '' && Number.isFinite(n)) {
          onChange(max != null ? Math.min(max, n) : n)
        }
      }}
      onBlur={() => {
        setFocused(false)
        const normalized = normalizeNumber(text, { min, max, fallback })
        setText(String(normalized))
        onChange(normalized)
      }}
    />
  )
}
