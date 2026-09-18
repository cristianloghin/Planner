/**
 * Cutting a repeating event in two at one of its days.
 *
 * "This and following" is a split: the series as it stands keeps every day
 * before the cut, and a new series takes over from the cut day. Neither half
 * needs to know about the other — the old one is capped by its rule's end, and
 * the new one is an ordinary series anchored on the cut day. These are the two
 * halves' rules, worked out from the whole.
 */
import { addDays } from '../../assets/utils/dates'
import type { CalendarEvent, Recurrence } from '../../domains/events/types'
import { occurrenceIndex } from './expand'

/**
 * The rule with its last day the one before `date`: what a series is left
 * with once everything from `date` on has been cut away.
 *
 * A count is dropped rather than kept beside the cap. The cap alone says where
 * the series ends, and a rule may have only one end (RFC 5545); a count of the
 * days before the cut would say the same thing a second way.
 */
export function recurrenceEndingBefore(r: Recurrence, date: string): Recurrence {
  return { freq: r.freq, interval: r.interval, until: addDays(date, -1) }
}

/**
 * The rule for the half of `e` that starts on `date`: the same cadence and
 * the same end. A last day stays as it is; a count becomes what is left of it
 * once the days before `date` are taken off — twelve lessons cut at the fifth
 * leave eight.
 *
 * `date` is expected to be a day the rule produces. One it does not cannot be
 * cut at, and the count is kept whole rather than guessed.
 */
export function recurrenceFrom(e: CalendarEvent, date: string): Recurrence | undefined {
  const r = e.recurrence
  if (!r || r.count == null) return r
  const index = occurrenceIndex(e, date) ?? 0
  return { ...r, count: Math.max(1, r.count - index) }
}
