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
 * `date` must be a day the rule produces (`startsOn`); callers gate on that.
 * A day it does not produce is not a cut, so the rule comes back unchanged
 * rather than with a count guessed from a position that does not exist.
 */
export function recurrenceFrom(e: CalendarEvent, date: string): Recurrence | undefined {
  const r = e.recurrence
  if (!r || r.count == null) return r
  const index = occurrenceIndex(e, date)
  if (index == null) return r
  return { ...r, count: Math.max(1, r.count - index) }
}

/**
 * The first day of the new half, given the day the series is cut at and the
 * day the new half was asked to start on. Usually the same day. The editor
 * lets the start move: moved earlier, the new half starts there and the old
 * one stops before it, so no day is produced by both halves; moved later,
 * the days in between are gone, which is what "from here on" means.
 */
export function splitDate(cutDay: string, newStart: string): string {
  return newStart < cutDay ? newStart : cutDay
}
