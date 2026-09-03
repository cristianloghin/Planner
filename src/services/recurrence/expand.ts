import { addDays, diffDays, toISODate } from '../../assets/utils/dates'
/**
 * Turning a repeating event into the actual days it lands on.
 *
 * The heart of the calendar: an event is a pattern, and this works out which
 * days that pattern produces, applies any one-off move to a single day, and
 * clamps a block that runs past midnight to each day it covers.
 *
 * Fed events and per-day state; fetches nothing.
 */
import type { CalendarEvent, Recurrence } from '../../domains/events/types'
import type { OccurrenceState } from '../../domains/occurrences/types'
import { occKey } from './status'
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

/** Does an occurrence of `e` start exactly on ISO `date`? */
export function startsOn(e: CalendarEvent, date: string): boolean {
  const base = eventDate(e)
  const delta = diffDays(date, base)
  if (delta < 0) return false
  // A capped series produces nothing after its inclusive `until`.
  if (e.recurrence?.until && diffDays(date, e.recurrence.until) > 0) return false
  if (delta === 0) return true
  const r = e.recurrence
  if (!r) return false
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return delta % n === 0
    case 'weekly':
      return delta % 7 === 0 && (delta / 7) % n === 0
    case 'monthly': {
      const a = new Date(`${base}T00:00:00`)
      const b = new Date(`${date}T00:00:00`)
      // Same day-of-month only (months missing that day simply skip).
      if (a.getDate() !== b.getDate()) return false
      const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      return months % n === 0
    }
  }
}

/**
 * The first occurrence start date of `e` on or after ISO `date`, or null when the
 * series has already ended (capped before `date`, or a one-off whose only slot is
 * in the past). Used to open a found event at its next upcoming occurrence
 * rather than its (possibly long-past) series anchor. Scans day-by-day, which
 * `startsOn` keeps correct
 * across all frequencies and the `until` cap; bounded so a dead series can't loop.
 */
export function nextStartOnOrAfter(e: CalendarEvent, date: string): string | null {
  const base = eventDate(e)
  const from = diffDays(date, base) <= 0 ? base : date
  // A one-off only ever sits on its anchor; recurring series walk forward.
  if (!e.recurrence) return from === base ? base : null
  for (let d = from, i = 0; i < 366 * 5; d = addDays(d, 1), i++) {
    if (startsOn(e, d)) return d
    // Past the inclusive cap there can be no further occurrence.
    if (e.recurrence.until && diffDays(d, e.recurrence.until) > 0) return null
  }
  return null
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

export function recurrenceLabel(r?: Recurrence): string {
  if (!r) return 'Does not repeat'
  const n = Math.max(1, r.interval)
  const unit = r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : 'month'
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
}
