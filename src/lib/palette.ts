// Unified color palette. One set of 12 colors is used for *everything* — a
// person's color and an event's color both reference the same keys. An event with
// no color of its own inherits the (lane) person's color, Google-Calendar style.
//
// The actual color values live in CSS (src/styles/swatches.css) as --color-1..12,
// so they can be tuned (and kept AA-compatible) without touching TypeScript. Here
// we only track the stable keys ("1".."12") stored in person.color and
// event_series.color_key, plus helpers to validate them and build the CSS var
// reference. No color values in JS.

export const COLOR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const

export type ColorKey = (typeof COLOR_KEYS)[number]

/** Fallback when a stored value is missing or not a known key. */
export const DEFAULT_COLOR: ColorKey = '1'

/** Type guard: is this string one of the twelve palette keys? */
export function isColorKey(key: string | null | undefined): key is ColorKey {
  return !!key && (COLOR_KEYS as readonly string[]).includes(key)
}

/** Coerce any stored value to a valid key, falling back to the default. */
export function colorKey(key: string | null | undefined): ColorKey {
  return isColorKey(key) ? key : DEFAULT_COLOR
}

/** The CSS custom-property reference for a key (the color itself lives in CSS).
 *  Assign it to `--c` (e.g. `style={{ '--c': colorVar(key) }}`) and let the
 *  stylesheet derive solid fills, tinted backgrounds and borders from it. */
export function colorVar(key: ColorKey): string {
  return `var(--color-${key})`
}
