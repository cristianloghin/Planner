// Fixed event-color palette. Events may opt into one of these colors by *key*
// (stored in `event_series.color_key`); the HSL values live here in code, not in
// the DB, so shades can be retuned without a migration. The HSL numbers below are
// placeholders meant to be tweaked — the *keys* are the stable contract with the
// stored data, so rename them with care.
//
// HSL (not hex) on purpose: a color is one hue + saturation at a given lightness,
// which makes the palette far easier to read and to derive light/dark variants
// from later (same H/S, move L).

export type Hsl = readonly [h: number, s: number, l: number];

/** `[h, s, l]` -> a CSS `hsl()` string. */
export const hsl = ([h, s, l]: Hsl): string => `hsl(${h} ${s}% ${l}%)`;

/**
 * The 12 selectable event colors, keyed by a stable name. Order here is the order
 * shown in the picker.
 */
export const EVENT_COLORS = {
  event_1: [0, 90, 54],
  event_2: [30, 100, 50],
  event_3: [60, 100, 40],
  event_4: [90, 75, 45],
  event_5: [120, 90, 45],
  event_6: [150, 85, 45],
  event_7: [180, 85, 45],
  event_8: [210, 90, 60],
  event_9: [240, 90, 70],
  event_10: [270, 70, 60],
  event_11: [300, 90, 45],
  event_12: [330, 100, 50],
} as const satisfies Record<string, Hsl>;

export type EventColorKey = keyof typeof EVENT_COLORS;

/** Palette keys in display order — for rendering the swatch picker. */
export const EVENT_COLOR_KEYS = Object.keys(EVENT_COLORS) as EventColorKey[];

/** Type guard: is this string one of the known palette keys? */
export function isEventColorKey(
  key: string | null | undefined,
): key is EventColorKey {
  return !!key && key in EVENT_COLORS;
}

/** CSS color for an event color key, or `null` when unset / unknown. */
export function eventColorCss(key: string | null | undefined): string | null {
  return isEventColorKey(key) ? hsl(EVENT_COLORS[key]) : null;
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
  main: Hsl;
  lightBg: Hsl;
  darkBg: Hsl;
}

export const USER_COLORS = {
  user_1: { main: [20, 75, 45], lightBg: [20, 90, 92], darkBg: [20, 45, 27] },
  user_2: { main: [60, 75, 35], lightBg: [60, 90, 85], darkBg: [60, 45, 23] },
  user_3: {
    main: [100, 75, 30],
    lightBg: [100, 90, 90],
    darkBg: [100, 45, 23],
  },
  user_4: {
    main: [140, 80, 35],
    lightBg: [140, 90, 90],
    darkBg: [140, 50, 23],
  },
  user_5: {
    main: [180, 75, 30],
    lightBg: [180, 70, 90],
    darkBg: [180, 45, 23],
  },
  user_6: {
    main: [220, 75, 50],
    lightBg: [220, 90, 92],
    darkBg: [220, 45, 30],
  },
  user_7: {
    main: [260, 75, 65],
    lightBg: [260, 90, 92],
    darkBg: [260, 45, 40],
  },
  user_8: {
    main: [300, 65, 50],
    lightBg: [300, 90, 92],
    darkBg: [300, 45, 30],
  },
  user_9: {
    main: [340, 75, 50],
    lightBg: [330, 80, 95],
    darkBg: [340, 90, 92],
  },
} as const satisfies Record<string, UserColor>;

export type UserColorKey = keyof typeof USER_COLORS;

/** User color keys in display order — for the Settings picker. */
export const USER_COLOR_KEYS = Object.keys(USER_COLORS) as UserColorKey[];

/** Fallback when a person has no (valid) color stored. */
export const DEFAULT_USER_COLOR: UserColorKey = "user_1";

/** Type guard: is this string one of the nine user color keys? */
export function isUserColorKey(
  key: string | null | undefined,
): key is UserColorKey {
  return !!key && key in USER_COLORS;
}

/** Resolve a stored value to a valid user color key (falling back to default). */
export function userColorKey(key: string | null | undefined): UserColorKey {
  return isUserColorKey(key) ? key : DEFAULT_USER_COLOR;
}
