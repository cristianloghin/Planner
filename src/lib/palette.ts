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

// ---- user colors ------------------------------------------------------------
//
// A person picks one of these nine in Settings. Each color is a vivid `main`
// (used for the person's lane / the event's left border default) plus two muted
// background shades — `lightBg`/`darkBg` are the event-block backgrounds for the
// light and dark themes respectively (same hue, different lightness). As with the
// event palette the HSL numbers are placeholders to tweak; the *keys* are the
// stored contract.

export interface UserColor {
  main: Hsl
  lightBg: Hsl
  darkBg: Hsl
}

export const USER_COLORS = {
  indigo: { main: [243, 75, 58], lightBg: [243, 70, 95], darkBg: [243, 40, 22] },
  blue: { main: [212, 80, 55], lightBg: [212, 75, 94], darkBg: [212, 45, 22] },
  teal: { main: [173, 70, 40], lightBg: [173, 55, 92], darkBg: [173, 40, 18] },
  green: { main: [142, 55, 42], lightBg: [142, 50, 92], darkBg: [142, 35, 18] },
  amber: { main: [38, 92, 50], lightBg: [40, 90, 92], darkBg: [36, 50, 20] },
  orange: { main: [22, 90, 52], lightBg: [24, 90, 93], darkBg: [20, 55, 22] },
  red: { main: [0, 72, 52], lightBg: [0, 80, 95], darkBg: [0, 45, 24] },
  pink: { main: [330, 75, 58], lightBg: [330, 80, 95], darkBg: [330, 45, 24] },
  purple: { main: [270, 65, 58], lightBg: [270, 65, 95], darkBg: [270, 40, 24] },
} as const satisfies Record<string, UserColor>

export type UserColorKey = keyof typeof USER_COLORS

/** User color keys in display order — for the Settings picker. */
export const USER_COLOR_KEYS = Object.keys(USER_COLORS) as UserColorKey[]

/** Fallback when a person has no (valid) color stored. */
export const DEFAULT_USER_COLOR: UserColorKey = 'indigo'

/** Type guard: is this string one of the nine user color keys? */
export function isUserColorKey(
  key: string | null | undefined,
): key is UserColorKey {
  return !!key && key in USER_COLORS
}

/** Resolve a stored value to a valid user color key (falling back to default). */
export function userColorKey(key: string | null | undefined): UserColorKey {
  return isUserColorKey(key) ? key : DEFAULT_USER_COLOR
}
