/**
 * Per-occurrence state: statuses, checklist ticks, timing overrides and
 * cancellations.
 *
 * Two tables (`event_occurrence` + `occurrence_item_state`) come back as one
 * map keyed by occurrence, because that is the shape the app reads and patches.
 * Rows are sparse by design — one exists only where an occurrence diverges from
 * its series — so an absent key means "nothing set", not "not loaded".
 */
import { dayRange, intervalToDuration, tsToDateKey, tsToStart } from './mappers'
import { fetchAll } from './pagination'
import { supabase } from './supabase'

/**
 * An occurrence's status, matching the DB `occurrence_status` lookup. `done` can
 * also be derived from a checklist (see `isOccurrenceDone`); `skipped`/`blocked`
 * are only ever set explicitly.
 */
export type OccurrenceStatusCode = 'done' | 'skipped' | 'blocked'

/**
 * Mutable per-occurrence state, keyed `${eventId}:${date}` (see
 * {@link CompletionsMap}), where `date` is the occurrence's start date. This is
 * where everything you *tick* lives, so a recurring event tracks completion
 * per day.
 */
export interface OccurrenceState {
  /**
   * Explicit occurrence status (`event_occurrence.status`). For a checklist-free
   * event this is how "done" is set manually; it also carries `skipped`/`blocked`.
   * Absent = compute (e.g. derive `done` from the checklist).
   */
  status?: OccurrenceStatusCode
  /** checklistEntryId → checked. */
  checked?: Record<string, boolean>
  /**
   * One-off timing override for *this* occurrence only (`event_occurrence`'s
   * `rescheduled_to` / `rescheduled_duration`). Same units as `CalendarEvent`:
   * `start` is `yyyy-mm-ddThh:mm` (timed) or `yyyy-mm-dd` (all-day) on the
   * occurrence's own date — the day is fixed, only the time of day and length
   * move; `duration` is minutes (timed) or whole days (all-day). Absent fields
   * fall back to the series timing.
   */
  start?: string
  duration?: number
  /** This occurrence has been removed from the series (`event_occurrence.cancelled`). */
  cancelled?: boolean
}

/**
 * Per-occurrence state keyed `${eventId}:${date}`. Fetched per window — these
 * tables grow with every tick ever made, so they are never loaded whole.
 */
export type CompletionsMap = Record<string, OccurrenceState>

const key = (seriesId: string, ts: string) => `${seriesId}:${tsToDateKey(ts)}`

/**
 * Per-occurrence state whose occurrence date falls in [fromDate, toDate) (local
 * ISO dates). Rows whose `rescheduled_to` lands in the window are included too,
 * so an occurrence moved INTO the window from a distant origin still renders.
 *
 * `accountId` is passed rather than ambient: these tables are scoped through
 * their parent series, and a user may belong to more than one account.
 */
export async function fetchOccurrenceWindow(
  accountId: string,
  fromDate: string,
  toDate: string,
): Promise<CompletionsMap> {
  const completions: CompletionsMap = {}
  const fromTs = dayRange(fromDate).from
  const toTs = dayRange(toDate).from

  const [occData, itemData] = await Promise.all([
    // Embed the parent's all_day so reschedule columns map back into the same
    // unit convention as CalendarEvent (timed = minutes, all-day = days). The
    // inner join also scopes the scan to this account, and both queries page
    // past the 1000-row response cap.
    fetchAll((from, to) =>
      supabase
        .from('event_occurrence')
        .select(
          'series_id, occurrence_start, status, rescheduled_to, rescheduled_duration, cancelled, event_series!inner(all_day, account_id)',
        )
        .eq('event_series.account_id', accountId)
        .or(
          `and(occurrence_start.gte."${fromTs}",occurrence_start.lt."${toTs}"),and(rescheduled_to.gte."${fromTs}",rescheduled_to.lt."${toTs}")`,
        )
        .order('series_id')
        .order('occurrence_start')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from('occurrence_item_state')
        .select('series_id, occurrence_start, item_id, status, event_series!inner()')
        .eq('event_series.account_id', accountId)
        .gte('occurrence_start', fromTs)
        .lt('occurrence_start', toTs)
        .order('series_id')
        .order('occurrence_start')
        .order('item_id')
        .range(from, to),
    ),
  ])

  for (const o of occData) {
    // PostgREST returns the to-one parent embed as an object.
    const allDay = (o.event_series as { all_day: boolean } | null)?.all_day ?? false
    const entry: OccurrenceState = { ...completions[key(o.series_id, o.occurrence_start)] }
    if (o.status) entry.status = o.status as OccurrenceStatusCode
    if (o.cancelled) entry.cancelled = true
    if (o.rescheduled_to) entry.start = tsToStart(o.rescheduled_to, allDay)
    if (o.rescheduled_duration) entry.duration = intervalToDuration(o.rescheduled_duration, allDay)
    // Skip rows that carry no app-visible state (e.g. a cleared override).
    if (entry.status || entry.cancelled || entry.start != null || entry.duration != null) {
      completions[key(o.series_id, o.occurrence_start)] = entry
    }
  }
  for (const it of itemData) {
    const k = key(it.series_id, it.occurrence_start)
    const checked = { ...(completions[k]?.checked ?? {}) }
    checked[it.item_id] = it.status === 'done'
    completions[k] = { ...completions[k], checked }
  }
  return completions
}
