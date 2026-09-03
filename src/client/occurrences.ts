/**
 * Per-occurrence state: timing overrides and cancellations.
 *
 * Rows of `event_occurrence` come back as one map keyed by occurrence, because
 * that is the shape the app reads and patches. Rows are sparse by design — one
 * exists only where an occurrence diverges from its series — so an absent key
 * means "nothing set", not "not loaded".
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
 * One day of a series that has something recorded against it.
 *
 * These rows are sparse by design — one exists only where a day differs from
 * its series — so no row means nothing was ever set, not that it failed to load.
 */
export interface OccurrenceRow {
  seriesId: string
  /** The day it belongs to, as `yyyy-mm-dd`. */
  date: string
  /** This day has been taken out of the series. */
  cancelled: boolean
  /** Moved to, in the series' own units. Null when it has not been moved. */
  start: string | null
  /** Its own length, in the series' own units. Null when unchanged. */
  duration: number | null
}

/**
 * Days with something recorded against them, between `fromDate` and `toDate`.
 *
 * A day moved INTO the window from further out is included too, so an
 * occurrence dragged here from a distant week still shows up.
 *
 * `accountId` is passed rather than assumed: these rows are reached through
 * their series, and a user may belong to more than one account.
 */
export async function fetchOccurrenceRows(
  accountId: string,
  fromDate: string,
  toDate: string,
): Promise<OccurrenceRow[]> {
  const fromTs = dayRange(fromDate).from
  const toTs = dayRange(toDate).from
  // The parent's all-day flag comes along so the moved-to time and length can
  // be read back in the same units the series uses. The join also limits the
  // scan to this account.
  const rows = await fetchAll((from, to) =>
    supabase
      .from('event_occurrence')
      .select(
        'series_id, occurrence_start, rescheduled_to, rescheduled_duration, cancelled, event_series!inner(all_day, account_id)',
      )
      .eq('event_series.account_id', accountId)
      .or(
        `and(occurrence_start.gte."${fromTs}",occurrence_start.lt."${toTs}"),and(rescheduled_to.gte."${fromTs}",rescheduled_to.lt."${toTs}")`,
      )
      .order('series_id')
      .order('occurrence_start')
      .range(from, to),
  )
  return rows.map((o) => {
    const allDay = (o.event_series as { all_day: boolean } | null)?.all_day ?? false
    return {
      seriesId: o.series_id,
      date: tsToDateKey(o.occurrence_start),
      cancelled: o.cancelled,
      start: o.rescheduled_to ? tsToStart(o.rescheduled_to, allDay) : null,
      duration: o.rescheduled_duration ? intervalToDuration(o.rescheduled_duration, allDay) : null,
    }
  })
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
 * reschedule already on the first one.
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

/** Put a moved or resized day back to its series' timing, keeping its ticks. */
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
