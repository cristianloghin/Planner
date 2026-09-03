/**
 * Turning a repeating event into the actual days it lands on.
 *
 * The heart of the calendar: an event is a pattern, and this works out which
 * days that pattern produces, applies any one-off move to a single day, and
 * clamps a block that runs past midnight to each day it covers.
 *
 * Fed events and per-day state; fetches nothing.
 */
import { RRule } from 'rrule'
import { DAY_NAMES, addDays, diffDays, toISODate, weekdayIndex } from '../../assets/utils/dates'
import type { CalendarEvent } from '../../domains/events/types'
import type { OccurrenceState } from '../../domains/occurrences/types'
import { occKey } from './timing'
import { eventDate, eventSpanDays, timedSegment } from './timing'

/**
 * The event as it actually occurs on `date`, with any one-off timing override
 * applied (`OccurrenceState.start`/`duration`). The series `id`, roster and
 * attachments are untouched — only the timing geometry changes — so callers that
 * need the *series* (e.g. to open the editor) must keep the original event.
 * Returns the original reference when there's no override.
 */
export function effectiveOccurrence(
  event: CalendarEvent,
  date: string,
  completions: Record<string, OccurrenceState>,
): CalendarEvent {
  const ov = completions[occKey(event.id, date)]
  if (!ov || (ov.start == null && ov.duration == null)) return event
  return {
    ...event,
    start: ov.start ?? event.start,
    duration: ov.duration ?? event.duration,
  }
}

/**
 * The widest span (in days) any occurrence of `event` can cover, accounting for
 * timing overrides that stretch a single occurrence across midnight — a longer
 * duration, or a later start that pushes the end past midnight. Bounds how far
 * back the day-scan must look so an extended occurrence still renders on the
 * later days it now reaches. `overrides` is the event's own completion entries
 * as `[date, state]` pairs.
 */
function maxEffectiveSpan(
  event: CalendarEvent,
  overrides: [string, OccurrenceState][],
  completions: Record<string, OccurrenceState>,
): number {
  let max = eventSpanDays(event)
  for (const [date, st] of overrides) {
    if (st.duration == null && st.start == null) continue
    max = Math.max(max, eventSpanDays(effectiveOccurrence(event, date, completions)))
  }
  return max
}

/**
 * The `rrule` rule for an event, or null for a one-off.
 *
 * Built in UTC on purpose. The app's model is date-level and its `start` is a
 * local wall time with no zone, so anchoring at UTC midnight makes the library's
 * instants stand for plain days — the "floating time" idiom rrule documents —
 * and DST cannot shift an occurrence onto the wrong date.
 */
function ruleFor(e: CalendarEvent): RRule | null {
  const r = e.recurrence
  if (!r) return null
  const [y, m, d] = eventDate(e).split('-').map(Number)
  const until = r.until?.split('-').map(Number)
  return new RRule({
    freq: FREQ[r.freq],
    interval: Math.max(1, r.interval),
    dtstart: new Date(Date.UTC(y, m - 1, d)),
    // The app's `until` is an inclusive date; end-of-day keeps the cap day in.
    ...(until ? { until: new Date(Date.UTC(until[0], until[1] - 1, until[2], 23, 59, 59)) } : {}),
    ...(r.count != null ? { count: r.count } : {}),
  })
}

const FREQ = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY } as const

/**
 * Occurrence dates are read a WINDOW at a time and cached, never one date at a
 * time. This is not premature: `rrule` has no O(1) "is this date an instance"
 * test — every query walks from `dtstart` — and `startsOn` is called for each
 * event on each rendered day. Measured over a 42-cell month grid with 40
 * events, asking the library per day costs ~316ms per render against ~0.1ms for
 * the arithmetic this replaced; asking it once per window and looking the day
 * up costs ~1.3ms. The window is what makes using the library affordable.
 */
const BAND_DAYS = 190
const cache = new Map<string, { from: string; to: string; dates: Set<string> }>()

function signature(e: CalendarEvent): string {
  const r = e.recurrence
  return `${e.id}|${e.start}|${r ? `${r.freq}:${r.interval}:${r.until ?? ''}:${r.count ?? ''}` : ''}`
}

/** Every date this event's rule produces in a band around `date`. */
function datesAround(e: CalendarEvent, date: string): Set<string> {
  const key = signature(e)
  const hit = cache.get(key)
  if (hit && date >= hit.from && date <= hit.to) return hit.dates
  const rule = ruleFor(e)
  if (!rule) return new Set([eventDate(e)])
  const from = addDays(date, -BAND_DAYS)
  const to = addDays(date, BAND_DAYS)
  const dates = new Set(
    rule
      .between(new Date(`${from}T00:00:00Z`), new Date(`${to}T23:59:59Z`), true)
      .map((d) => d.toISOString().slice(0, 10)),
  )
  // Keyed on the rule's own shape, so an edit misses and re-expands. Bounded so
  // a long session paging through months cannot grow it without limit.
  if (cache.size > 400) cache.clear()
  cache.set(key, { from, to, dates })
  return dates
}

/**
 * Does an occurrence of `e` start exactly on ISO `date`?
 *
 * `until` and `count` are the library's job now: both are carried in the rule
 * (RFC-5545 UNTIL and COUNT), so a counted series stops after its Nth slot and
 * the monthly-overflow rule — an anchor on the 31st produces nothing in
 * February, and that missing month does not consume one of the N — comes from
 * `rrule` rather than from arithmetic maintained here and mirrored in the
 * sender.
 */
export function startsOn(e: CalendarEvent, date: string): boolean {
  if (!e.recurrence) return date === eventDate(e)
  return datesAround(e, date).has(date)
}

/**
 * The first occurrence start date of `e` on or after ISO `date`, or null when
 * the series has already ended. Used to open a found event at its next upcoming
 * occurrence rather than its (possibly long-past) series anchor.
 */
export function nextStartOnOrAfter(e: CalendarEvent, date: string): string | null {
  const base = eventDate(e)
  if (!e.recurrence) return diffDays(date, base) <= 0 ? base : null
  const rule = ruleFor(e)
  const next = rule?.after(new Date(`${date}T00:00:00Z`), true)
  return next ? next.toISOString().slice(0, 10) : null
}

/** Where to land when jumping to `e` (e.g. from a search hit): its next
 *  occurrence on or after today, or the series anchor once the series ended. */
export function nextRelevantDate(e: CalendarEvent): string {
  return nextStartOnOrAfter(e, toISODate(new Date())) ?? eventDate(e)
}

/** One materialised event instance covering a specific date. */
export interface DayOccurrence {
  event: CalendarEvent
  /**
   * ISO date of the occurrence's *identity* — the day the recurrence rule would
   * normally place it (its per-occurrence state key). For a relocated occurrence
   * (`moved`) this is the ORIGINAL day, not the day it now renders on.
   */
  start: string
  /** 0-based index of the queried date within the span. */
  offset: number
  span: number
  isStart: boolean
  isEnd: boolean
  /** Minute range covered on the queried day. All-day events use the full day. */
  segment: { start: number; end: number }
  /** This occurrence was moved to a different day by a one-off override. */
  moved?: boolean
}

/**
 * The ISO date a one-off override relocates an occurrence to, or null if it isn't
 * a relocation (no override, or it only changes time/length on the same day).
 * `originDate` is the occurrence's identity date.
 */
function relocatedTo(ov: OccurrenceState | undefined, originDate: string): string | null {
  if (!ov || ov.cancelled || ov.start == null) return null
  const movedDate = ov.start.slice(0, 10)
  return movedDate === originDate ? null : movedDate
}

/**
 * Occurrences (timed blocks or all-day spans) that cover ISO `date`. Per-occurrence
 * timing overrides in `completions` reshape the geometry (`segment`/`span`) and a
 * `cancelled` override hides the occurrence; the returned `event` stays the
 * original *series* so callers can still open the editor on it.
 */
export function occurrencesOnDate(
  events: CalendarEvent[],
  date: string,
  completions: Record<string, OccurrenceState> = {},
): DayOccurrence[] {
  const out: DayOccurrence[] = []
  // Group completion entries by series id once: this function runs per day cell,
  // and scanning the whole map per event made it O(events × completions).
  const overridesByEvent = new Map<string, [string, OccurrenceState][]>()
  for (const [k, st] of Object.entries(completions)) {
    const sep = k.indexOf(':')
    if (sep < 0) continue
    const id = k.slice(0, sep)
    let arr = overridesByEvent.get(id)
    if (!arr) {
      arr = []
      overridesByEvent.set(id, arr)
    }
    arr.push([k.slice(sep + 1), st])
  }
  const NONE: [string, OccurrenceState][] = []
  for (const event of events) {
    const overrides = overridesByEvent.get(event.id) ?? NONE
    // 1. Occurrences RELOCATED onto `date` by a one-off override. Their identity
    //    stays the original day; only the rendered position moves here.
    for (const [origin, st] of overrides) {
      const movedStart = relocatedTo(st, origin)
      if (movedStart == null) continue
      // A stale override whose origin the rule no longer produces (e.g. the
      // series was edited after the move) must not ghost-render.
      if (!startsOn(event, origin)) continue
      const eff = effectiveOccurrence(event, origin, completions)
      const span = eventSpanDays(eff)
      const offset = diffDays(date, movedStart)
      if (offset < 0 || offset >= span) continue // this relocated span doesn't cover `date`
      out.push({
        event,
        start: origin,
        offset,
        span,
        isStart: offset === 0,
        isEnd: offset === span - 1,
        segment: eff.allDay ? { start: 0, end: 24 * 60 } : timedSegment(eff, offset, span),
        moved: true,
      })
    }

    // 2. Rule-produced occurrences. A span covering `date` may have begun earlier;
    //    an override can stretch it further still. The smallest offset wins.
    // An occurrence that doesn't cover `date` (cancelled, moved away, shortened)
    // must not stop the scan: an EARLIER multi-day occurrence may still reach it.
    const maxSpan = maxEffectiveSpan(event, overrides, completions)
    for (let back = 0; back < maxSpan; back++) {
      const start = addDays(date, -back)
      if (!startsOn(event, start)) continue
      const ov = completions[occKey(event.id, start)]
      if (ov?.cancelled) continue // this occurrence was removed
      if (relocatedTo(ov, start) != null) continue // moved away to another day (rendered in pass 1)
      const eff = effectiveOccurrence(event, start, completions)
      const span = eventSpanDays(eff)
      if (back >= span) continue // an override shortened it so it no longer reaches `date`
      out.push({
        event,
        start,
        offset: back,
        span,
        isStart: back === 0,
        isEnd: back === span - 1,
        segment: eff.allDay ? { start: 0, end: 24 * 60 } : timedSegment(eff, back, span),
      })
      break
    }
  }
  return out
}

export function recurrenceLabel(e?: Pick<CalendarEvent, 'start' | 'recurrence'>): string {
  const r = e?.recurrence
  if (!r) return 'Does not repeat'
  const n = Math.max(1, r.interval)
  const unit = r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : 'month'
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
  // A weekly rule's weekday comes from the anchor and is never stored, so say
  // it back: read in the sheet's meta line, this label is the sentence the user
  // had in their head, which is the check that the model expresses it.
  const on = r.freq === 'weekly' ? ` on ${DAY_NAMES[weekdayIndex(e.start.slice(0, 10))]}` : ''
  const end =
    r.count != null ? ` · ${r.count} times` : r.until ? ` · until ${endLabel(r.until)}` : ''
  return `${every}${on}${end}`
}

/** "25 Dec" — the end of a series, short enough for a meta line. */
function endLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
