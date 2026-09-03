import { type Frequency, RRule } from 'rrule'
import type { Recurrence, RecurrenceFreq } from './series'

/**
 * The bridge between the app's lightweight `Recurrence` ({freq, interval}) and
 * the RFC-5545 RRULE strings stored in `event_series.rrule`.
 *
 * Per DATA_MODEL.md Decision 2 the DB does NO recurrence math and `COUNT` is
 * forbidden — every stored rule is UNTIL-bounded or infinite. Phase-1 only ever
 * produces FREQ + INTERVAL (always infinite), so the conversion is total and
 * lossless. `rrule` is the single source of truth so the expansion work (which
 * needs real RRULE math) builds on the same parser.
 */

const FREQ_TO_RRULE: Record<RecurrenceFreq, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
}

const RRULE_TO_FREQ: Partial<Record<Frequency, RecurrenceFreq>> = {
  [RRule.DAILY]: 'daily',
  [RRule.WEEKLY]: 'weekly',
  [RRule.MONTHLY]: 'monthly',
}

/**
 * Serialize a `Recurrence` to a bare RRULE string (no `RRULE:` prefix, no
 * `DTSTART` — the series stores its start in the `dtstart` column separately).
 * Returns null for a one-off (no recurrence), matching the nullable column.
 */
export function recurrenceToRRule(r: Recurrence | undefined): string | null {
  if (!r) return null
  const rule = new RRule({
    freq: FREQ_TO_RRULE[r.freq],
    interval: Math.max(1, r.interval),
    // UNTIL is an RFC-5545 UTC instant; the app's `until` is a plain ISO date.
    // Encode it as the UTC end of that day so the stored instant identifies the
    // date without reference to the writer's timezone — a partner in another
    // timezone must decode the same date, and the app's own `until` comparisons
    // are date-level (see `startsOn`), never instant-level.
    ...(r.until ? { until: new Date(`${r.until}T23:59:59Z`) } : {}),
  })
  // RRule.toString() yields "RRULE:FREQ=WEEKLY;INTERVAL=2"; store the bare rule.
  return rule.toString().replace(/^RRULE:/, '')
}

/**
 * Parse a stored RRULE string back into a `Recurrence`. Returns undefined for a
 * null/empty rule (a one-off). Throws on a `COUNT` rule — that invariant is
 * supposed to be enforced before write, so seeing one on read is a real bug.
 * A frequency the app doesn't model collapses to undefined (treated one-off)
 * rather than crashing the whole load.
 */
export function rruleToRecurrence(rrule: string | null | undefined): Recurrence | undefined {
  if (!rrule) return undefined
  const options = RRule.parseString(rrule)
  if (options.count != null) {
    throw new Error(`rruleToRecurrence: COUNT rules are forbidden (got "${rrule}")`)
  }
  const freq = options.freq != null ? RRULE_TO_FREQ[options.freq] : undefined
  if (!freq) return undefined
  // UNTIL comes back as a Date (UTC instant); reduce it to the ISO date it
  // identifies — in UTC, so every reader decodes the same date regardless of
  // device timezone. `recurrenceToRRule` is the only writer and always encodes
  // the UTC end of the day, so the instant's UTC date *is* the intended date.
  const until = options.until ? options.until.toISOString().slice(0, 10) : undefined
  return { freq, interval: options.interval ?? 1, ...(until ? { until } : {}) }
}
