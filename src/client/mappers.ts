/**
 * Conversions between Postgres column types and the shapes the app works in.
 *
 * These exist because the two genuinely differ, not as a matter of style: the
 * app's whole date model is naive-local strings ('yyyy-mm-dd' / 'yyyy-mm-ddThh:mm')
 * while the DB stores `timestamptz`, and durations are minutes or whole days in
 * the app but `interval` text on the wire. Converting once here is what keeps
 * timezone and unit handling out of every call site.
 *
 * Everything in this file is pure — no client, no network. See mappers.test.ts.
 */
import { toDateTimeLocal, toISODate } from '../lib/dates'

const MINS_PER_DAY = 24 * 60

/** App start string -> timestamptz (UTC ISO). Local naive time in, UTC out. */
export function startToTs(start: string, allDay: boolean): string {
  const d = allDay ? new Date(`${start}T00:00:00`) : new Date(start)
  return d.toISOString()
}

/** timestamptz -> app start string ('yyyy-mm-dd' all-day, else 'yyyy-mm-ddThh:mm'). */
export function tsToStart(ts: string, allDay: boolean): string {
  const d = new Date(ts)
  return allDay ? toISODate(d) : toDateTimeLocal(d)
}

/** App duration (minutes timed / whole days all-day) -> Postgres interval literal. */
export function durationToInterval(duration: number, allDay: boolean): string {
  return allDay ? `${Math.max(1, duration)} days` : `${Math.max(0, duration)} minutes`
}

/** Parse a Postgres or ISO-8601 interval string to total minutes. */
export function intervalToMinutes(iv: string | null): number {
  if (!iv) return 0
  const iso = iv.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (iso) {
    const [, d, h, m] = iso
    return Number(d || 0) * MINS_PER_DAY + Number(h || 0) * 60 + Number(m || 0)
  }
  let min = 0
  const dayM = iv.match(/(\d+)\s+days?/)
  if (dayM) min += Number(dayM[1]) * MINS_PER_DAY
  // Anchor at the end so a 3+ digit hour count ("100:00:00") parses whole.
  const timeM = iv.match(/(\d+):(\d{2}):(\d{2})\s*$/)
  if (timeM) min += Number(timeM[1]) * 60 + Number(timeM[2])
  return min
}

/** Interval text -> app duration, in the unit the event's `allDay` implies. */
export function intervalToDuration(iv: string | null, allDay: boolean): number {
  const min = intervalToMinutes(iv)
  return allDay ? Math.max(1, Math.round(min / MINS_PER_DAY)) : min
}

/** The app's occurrence key date (local ISO) for a stored occurrence_start. */
export function tsToDateKey(ts: string): string {
  return toISODate(new Date(ts))
}

/**
 * UTC timestamp bounds of local ISO `date` — the half-open [from, to) window an
 * occurrence-row `occurrence_start` for that date falls in. Occurrence rows are
 * MATCHED by this window rather than by an exact timestamp: the stored value
 * carries the time-of-day the series had when the row was written, so after the
 * series' start time is edited an exact match would silently miss every
 * existing row (orphaning ticks, statuses and overrides), while the app itself
 * only ever keys occurrence state by date (`tsToDateKey`).
 */
export function dayRange(date: string): { from: string; to: string } {
  const d = new Date(`${date}T00:00:00`)
  const from = d.toISOString()
  d.setDate(d.getDate() + 1)
  return { from, to: d.toISOString() }
}
