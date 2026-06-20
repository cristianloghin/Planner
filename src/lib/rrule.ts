import { RRule, Frequency } from 'rrule'
import type { Recurrence, RecurrenceFreq } from '../types'
import { addDays, toISODate } from './dates'

/**
 * The bridge between the app's lightweight `Recurrence` ({freq, interval}) and
 * the RFC-5545 RRULE strings stored in `event_series.rrule`.
 *
 * Per DATA_MODEL.md Decision 2 the DB does NO recurrence math and `COUNT` is
 * forbidden — every stored rule is UNTIL-bounded or infinite. Phase-1 only ever
 * produces FREQ + INTERVAL (always infinite), so the conversion is total and
 * lossless. `rrule` is the single source of truth so the later split / expand
 * work (which needs real RRULE math) builds on the same parser.
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
    // UNTIL is an RFC-5545 UTC instant; the app's `until` is a local ISO date.
    // Encode it as the local end of that day so a round-trip back through
    // `toISODate` (also local) lands on the same date.
    ...(r.until ? { until: new Date(`${r.until}T23:59:59`) } : {}),
  })
  // RRule.toString() yields "RRULE:FREQ=WEEKLY;INTERVAL=2"; store the bare rule.
  return rule.toString().replace(/^RRULE:/, '')
}

/**
 * The bare RRULE for `r` capped so its last occurrence falls strictly *before*
 * `splitDate` (i.e. `UNTIL = splitDate − 1 day`). Used to truncate the old series
 * on a "this and following" split, so the split day belongs only to the new
 * series. `splitDate` is a local ISO date.
 */
export function truncatedRRule(r: Recurrence, splitDate: string): string {
  // recurrenceToRRule never returns null for a defined recurrence.
  return recurrenceToRRule({ ...r, until: addDays(splitDate, -1) }) as string
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
  // UNTIL comes back as a Date (UTC instant); reduce it to the local ISO date the
  // rest of the app compares against. Without this a capped (split) series would
  // reload as infinite and re-render occurrences past its cap.
  const until = options.until ? toISODate(new Date(options.until)) : undefined
  return { freq, interval: options.interval ?? 1, ...(until ? { until } : {}) }
}
