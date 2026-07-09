import { Check } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { cx } from '../lib/cx'
import s from './ColorPicker.module.css'

export interface ColorOption<T extends string> {
  /** Stable key stored against the picked value. */
  value: T
  /** CSS color for the swatch (e.g. a `var(--color-N)` reference). */
  color: string
  /** Accessible label for this swatch. */
  label: string
}

interface ColorPickerProps<T extends string> {
  options: ColorOption<T>[]
  /** Currently selected key, or `null` when nothing is explicitly selected. */
  value: T | null
  onChange: (value: T) => void
  /**
   * Key to treat as selected when `value` is `null` — i.e. the color the picker
   * falls back to (e.g. an inherited default). It must be one of `options`, so
   * the picker can show that swatch as selected rather than rendering a
   * non-color. Without it, a `null` value leaves the trigger empty.
   */
  defaultValue?: T
  /** Accessible label for the trigger and the swatch group. */
  ariaLabel: string
}

/**
 * Generic Radix Popover color picker. The trigger is the currently selected
 * swatch; clicking it opens a popover of all options, each marked with a check
 * when selected. Picking one selects it and closes the popover.
 */
export function ColorPicker<T extends string>({
  options,
  value,
  onChange,
  defaultValue,
  ariaLabel,
}: ColorPickerProps<T>) {
  const [open, setOpen] = useState(false)
  // What the picker resolves to for display: the explicit value, else the
  // fallback default. Both render as a real swatch — never a non-color.
  const effective = value ?? defaultValue ?? null
  const selected = effective != null ? options.find((o) => o.value === effective) : null

  function select(next: T) {
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={s.trigger}
          style={selected ? { background: selected.color } : undefined}
          aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={s.content}
          sideOffset={6}
          align="start"
          role="radiogroup"
          aria-label={ariaLabel}
        >
          <div className={s.grid}>
            {options.map((o) => {
              const on = effective === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  className={cx(s.swatch, on && s.swatchOn)}
                  style={{ background: o.color }}
                  aria-label={o.label}
                  aria-pressed={on}
                  onClick={() => select(o.value)}
                >
                  {on && <Check className={s.check} size={20} aria-hidden strokeWidth={3} />}
                </button>
              )
            })}
          </div>
          <Popover.Arrow className={s.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
