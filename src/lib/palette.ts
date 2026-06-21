// Fixed event-color palette. Events may opt into one of these colors by *key*
// (stored in `event_series.color_key`); the HSL values live here in code, not in
// the DB, so shades can be retuned without a migration. The HSL numbers below are
// placeholders meant to be tweaked — the *keys* are the stable contract with the
// stored data, so rename them with care.
//
// HSL (not hex) on purpose: a color is one hue + saturation at a given lightness,
// which makes the palette far easier to read and to derive light/dark variants
// from later (same H/S, move L).

export type Hsl = readonly [h: number, s: number, l: number]

/** `[h, s, l]` -> a CSS `hsl()` string. */
export const hsl = ([h, s, l]: Hsl): string => `hsl(${h} ${s}% ${l}%)`

/**
 * The 12 selectable event colors, keyed by a stable name. Order here is the order
 * shown in the picker.
 */
export const EVENT_COLORS = {
  red: [0, 72, 51],
  orange: [25, 90, 52],
  amber: [38, 92, 50],
  yellow: [48, 90, 50],
  lime: [85, 62, 45],
  green: [142, 60, 42],
  teal: [173, 70, 38],
  cyan: [190, 80, 42],
  blue: [217, 80, 56],
  indigo: [243, 75, 58],
  violet: [270, 70, 60],
  pink: [330, 75, 58],
} as const satisfies Record<string, Hsl>

export type EventColorKey = keyof typeof EVENT_COLORS

/** Palette keys in display order — for rendering the swatch picker. */
export const EVENT_COLOR_KEYS = Object.keys(EVENT_COLORS) as EventColorKey[]

/** Type guard: is this string one of the known palette keys? */
export function isEventColorKey(
  key: string | null | undefined,
): key is EventColorKey {
  return !!key && key in EVENT_COLORS
}

/** CSS color for an event color key, or `null` when unset / unknown. */
export function eventColorCss(key: string | null | undefined): string | null {
  return isEventColorKey(key) ? hsl(EVENT_COLORS[key]) : null
}
