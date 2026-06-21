import { useState } from "react";
import { Popover } from "radix-ui";
import { cx } from "../lib/cx";
import s from "./ColorPicker.module.css";

export interface ColorOption<T extends string> {
  /** Stable key stored against the picked value. */
  value: T;
  /** CSS color for the swatch (e.g. a `var(--color-N)` reference). */
  color: string;
  /** Accessible label for this swatch. */
  label: string;
}

interface ColorPickerProps<T extends string> {
  options: ColorOption<T>[];
  /** Currently selected key, or `null` when nothing is selected. */
  value: T | null;
  onChange: (value: T | null) => void;
  /** When set, offer a selectable "no colour" swatch (value becomes `null`). */
  allowNone?: boolean;
  /** Accessible label for the trigger and the swatch group. */
  ariaLabel: string;
}

/**
 * Generic Radix Popover color picker. The trigger is the currently selected
 * swatch (or a "no colour" placeholder); clicking it opens a popover of all
 * options, and picking one selects it and closes the popover.
 */
export function ColorPicker<T extends string>({
  options,
  value,
  onChange,
  allowNone = false,
  ariaLabel,
}: ColorPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = value != null ? options.find((o) => o.value === value) : null;

  function select(next: T | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(s.trigger, !selected && s.swatchNone)}
          style={selected ? { background: selected.color } : undefined}
          aria-label={
            selected ? `${ariaLabel}: ${selected.label}` : `${ariaLabel}: none`
          }
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
            {allowNone && (
              <button
                type="button"
                className={cx(
                  s.swatch,
                  s.swatchNone,
                  value == null && s.swatchOn,
                )}
                aria-label="No colour"
                aria-pressed={value == null}
                onClick={() => select(null)}
              />
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cx(s.swatch, value === o.value && s.swatchOn)}
                style={{ background: o.color }}
                aria-label={o.label}
                aria-pressed={value === o.value}
                onClick={() => select(o.value)}
              />
            ))}
          </div>
          <Popover.Arrow className={s.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
