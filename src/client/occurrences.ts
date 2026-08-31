/**
 * Per-occurrence state: statuses, checklist ticks, timing overrides and
 * cancellations.
 *
 * Two tables (`event_occurrence` + `occurrence_item_state`) come back as one
 * map keyed by occurrence, because that is the shape the app reads and patches.
 * Rows are sparse by design — one exists only where an occurrence diverges from
 * its series — so an absent key means "nothing set", not "not loaded".
 */
import type { TablesUpdate } from './database.types'
import {
  dayRange,
  durationToInterval,
  intervalToDuration,
  occurrenceTs,
  startToTs,
  tsToDateKey,
  tsToStart,
} from './mappers'
import { fetchAll } from './pagination'
import type { SeriesTiming } from './series'
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

// ---- writes --------------------------------------------------------------

/**
 * Set fields on one day's row, creating it if this is the first thing recorded
 * against that day.
 *
 * The existing row is looked up by day rather than by exact timestamp, and then
 * updated at whatever timestamp it actually carries. This is the whole reason
 * this is a lookup and not a plain upsert: a row written before the series' time
 * was edited still sits at the old time of day, so an upsert keyed on today's
 * computed timestamp would insert a second row for the same day and strand the
 * ticks, status and reschedule already on the first one.
 *
 * Only fields passed in are touched, so recording one thing never wipes another.
 */
async function writeOccurrenceRow(
  series: SeriesTiming,
  date: string,
  fields: TablesUpdate<'event_occurrence'>,
): Promise<void> {
  const { from, to } = dayRange(date)
  const { data, error: selErr } = await supabase
    .from('event_occurrence')
    .select('occurrence_start')
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
    .limit(1)
  if (selErr) throw selErr
  const existing = data?.[0]
  const { error } = existing
    ? await supabase
        .from('event_occurrence')
        .update(fields)
        .eq('series_id', series.id)
        .eq('occurrence_start', existing.occurrence_start)
    : await supabase
        .from('event_occurrence')
        .upsert(
          { series_id: series.id, occurrence_start: occurrenceTs(series, date), ...fields },
          { onConflict: 'series_id,occurrence_start' },
        )
  if (error) throw error
}

/**
 * Set one day's status, or clear it with null.
 *
 * Clearing does not simply delete the row: it may also be carrying a reschedule
 * or a cancellation. So rows holding nothing else are deleted, and any row that
 * is holding something else just has its status emptied.
 */
export async function setOccurrenceStatus(
  series: SeriesTiming,
  date: string,
  status: OccurrenceStatusCode | null,
): Promise<void> {
  if (status) return writeOccurrenceRow(series, date, { status })

  const { from, to } = dayRange(date)
  const del = await supabase
    .from('event_occurrence')
    .delete()
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
    .is('rescheduled_to', null)
    .is('rescheduled_duration', null)
    .eq('cancelled', false)
  if (del.error) throw del.error
  const upd = await supabase
    .from('event_occurrence')
    .update({ status: null })
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
  if (upd.error) throw upd.error
}

/**
 * Move or resize a single day, leaving the rest of the series alone.
 *
 * The day keeps its original identity — the new time is recorded alongside it,
 * not in place of it — so anything already ticked or set on that day stays put.
 * `start` and `duration` use the same units as the series: minutes and
 * `yyyy-mm-ddThh:mm` for a timed one, whole days and `yyyy-mm-dd` for all-day.
 */
export async function setOccurrenceOverride(
  series: SeriesTiming,
  date: string,
  start: string,
  duration: number,
): Promise<void> {
  return writeOccurrenceRow(series, date, {
    rescheduled_to: startToTs(start, series.allDay),
    rescheduled_duration: durationToInterval(duration, series.allDay),
  })
}

/** Put a moved or resized day back to its series' timing, keeping its status and ticks. */
export async function clearOccurrenceOverride(series: SeriesTiming, date: string): Promise<void> {
  const { from, to } = dayRange(date)
  const { error } = await supabase
    .from('event_occurrence')
    .update({ rescheduled_to: null, rescheduled_duration: null })
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
  if (error) throw error
}

/**
 * Take a single day out of its series.
 *
 * The repeat rule still produces that day; the row's flag is what makes it stop
 * being drawn and stop sending reminders. Its status and ticks are left in
 * place, so putting it back would restore them.
 */
export async function cancelOccurrence(series: SeriesTiming, date: string): Promise<void> {
  return writeOccurrenceRow(series, date, { cancelled: true })
}

/**
 * Tick or untick one checklist line on one day.
 *
 * A tick is recorded by the presence of a row and unticking removes it, so this
 * clears the day's row first either way. Clearing by day, not by exact
 * timestamp, is what lets a tick made before the series' time was edited still
 * be found — and stops a second row being written for the same day.
 */
export async function setChecklistEntry(
  series: SeriesTiming,
  date: string,
  entryId: string,
  checked: boolean,
): Promise<void> {
  const { from, to } = dayRange(date)
  const del = await supabase
    .from('occurrence_item_state')
    .delete()
    .eq('series_id', series.id)
    .eq('item_id', entryId)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
  if (del.error) throw del.error
  if (!checked) return
  const { error } = await supabase.from('occurrence_item_state').upsert(
    {
      series_id: series.id,
      occurrence_start: occurrenceTs(series, date),
      item_id: entryId,
      status: 'done',
    },
    { onConflict: 'series_id,occurrence_start,item_id' },
  )
  if (error) throw error
}

// ---- one day waiting on another ------------------------------------------

/**
 * One thing a day is waiting on: a particular day of another series, and how
 * far along that day has to be before this one is allowed to go ahead.
 */
export interface OccurrenceDependency {
  prerequisiteSeriesId: string
  /** The day of that series being waited on, as `yyyy-mm-dd`. */
  prerequisiteDate: string
  requiredStatus: OccurrenceStatusCode
}

/**
 * Everything every day is waiting on, grouped by the day doing the waiting.
 *
 * Keys are `${seriesId}:${date}`, the same as {@link CompletionsMap} and the
 * to-do pins, so a day's state can be looked up across all three at once.
 *
 * Paged, since one response stops at 1000 rows.
 */
export async function fetchDependencies(
  accountId: string,
): Promise<Record<string, OccurrenceDependency[]>> {
  const data = await fetchAll((from, to) =>
    supabase
      .from('occurrence_dependency')
      // Scoped through the waiting series. This table names two series, so the
      // join has to say which one it means.
      .select(
        'dependent_series, dependent_occurrence, prerequisite_series, prerequisite_occurrence, required_status, event_series!dependent_series!inner()',
      )
      .eq('event_series.account_id', accountId)
      .order('dependent_series')
      .order('dependent_occurrence')
      .order('prerequisite_series')
      .order('prerequisite_occurrence')
      .range(from, to),
  )
  const out: Record<string, OccurrenceDependency[]> = {}
  for (const row of data) {
    const k = `${row.dependent_series}:${tsToDateKey(row.dependent_occurrence)}`
    out[k] ??= []
    out[k].push({
      prerequisiteSeriesId: row.prerequisite_series,
      prerequisiteDate: tsToDateKey(row.prerequisite_occurrence),
      requiredStatus: row.required_status as OccurrenceStatusCode,
    })
  }
  return out
}

/**
 * Make one day wait on a day of another series.
 *
 * Any existing wait between the same two days is cleared first. Both ends are
 * stored as timestamps, and either series may have had its time edited since,
 * so without clearing by day the same pair could end up recorded twice.
 *
 * Both series' timings are needed because a new row has to be written at the
 * time of day each of them keeps.
 */
export async function addDependency(
  dependent: SeriesTiming,
  date: string,
  prerequisite: SeriesTiming,
  prerequisiteDate: string,
  requiredStatus: OccurrenceStatusCode,
): Promise<void> {
  await removeDependency(dependent.id, date, prerequisite.id, prerequisiteDate)
  const { error } = await supabase.from('occurrence_dependency').upsert(
    {
      dependent_series: dependent.id,
      dependent_occurrence: occurrenceTs(dependent, date),
      prerequisite_series: prerequisite.id,
      prerequisite_occurrence: occurrenceTs(prerequisite, prerequisiteDate),
      required_status: requiredStatus,
    },
    {
      onConflict:
        'dependent_series,dependent_occurrence,prerequisite_series,prerequisite_occurrence',
    },
  )
  if (error) throw error
}

/**
 * Stop one day waiting on a day of another series.
 *
 * Only ids and dates are needed: both ends are matched by day, so a wait
 * recorded before either series' time was edited is still found.
 */
export async function removeDependency(
  dependentId: string,
  date: string,
  prerequisiteId: string,
  prerequisiteDate: string,
): Promise<void> {
  const dep = dayRange(date)
  const pre = dayRange(prerequisiteDate)
  const { error } = await supabase
    .from('occurrence_dependency')
    .delete()
    .eq('dependent_series', dependentId)
    .gte('dependent_occurrence', dep.from)
    .lt('dependent_occurrence', dep.to)
    .eq('prerequisite_series', prerequisiteId)
    .gte('prerequisite_occurrence', pre.from)
    .lt('prerequisite_occurrence', pre.to)
  if (error) throw error
}
