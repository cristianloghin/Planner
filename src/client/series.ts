/**
 * Event series (`event_series`) and everything hanging off one: who is on it,
 * and its reminders.
 *
 * One table, one module. A series with a date is an event; a series without one
 * is a blueprint to make events from (`is_template`). They are the same row with
 * the same children, so they are read and written by the same code here. What
 * the app calls them, and how it splits them into its own shapes, is the app's
 * business.
 */
import { type ColorKey, isColorKey } from '../assets/palette'
import { durationToInterval, intervalToDuration, startToTs, tsToStart } from './mappers'
import { fetchAll } from './pagination'
import type { PersonId } from './people'
import { recurrenceToRRule, rruleToRecurrence } from './rrule'
import { supabase } from './supabase'

/** How often a series repeats. */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Repeat every N units (at least 1): every 2 days, every 3 weeks... */
  interval: number
  /**
   * Last day the series may produce an occurrence, as `yyyy-mm-dd`. Absent means
   * it is not date-bounded.
   */
  until?: string
  /**
   * Stop after this many occurrences. Absent means it is not count-bounded.
   *
   * Kept beside the rrule rather than in it: DATA_MODEL Decision 2 keeps the
   * stored string UNTIL-or-infinite, so nothing at the string boundary
   * (`rruleToRecurrence`, `recurrenceToRRule`, the sender's hand-rolled
   * `parseRRule`) has to learn about COUNT, and SQL can see the count without
   * parsing anything. The editor sets exactly one of `until` / `count`.
   */
  count?: number
}

/** A reminder, as minutes before the series starts. */
export interface SeriesReminder {
  id: string
  offset: number
}

/**
 * One series, with its people and everything attached to it.
 *
 * Timing is `start` plus `duration`. When `allDay` is false, `start` is
 * `yyyy-mm-ddThh:mm` and `duration` is minutes; when it is true, `start` is
 * `yyyy-mm-dd` and `duration` is whole days.
 */
export interface Series {
  id: string
  title: string
  allDay: boolean
  /** Null on a blueprint, which has no point in time. */
  start: string | null
  duration: number
  /** Absent on a one-off, and on a blueprint. */
  recurrence?: Recurrence
  attendees: PersonId[]
  /** Absent means it takes the colour of the person whose lane it sits in. */
  colorKey?: ColorKey
  reminders: SeriesReminder[]
  /** True for a blueprint with no date, false for a real dated series. */
  isTemplate: boolean
}

/**
 * Which series, and its timing.
 *
 * Enough to write against one of its days without carrying the whole thing
 * around — a `Series` fits wherever this is asked for. Writes that name a day
 * take this rather than a full series, so they stay small enough to hold onto
 * and replay after being offline.
 */
export interface SeriesTiming {
  id: string
  allDay: boolean
  start: string | null
}

/**
 * The row and its children, as they come back from the select below.
 *
 * Written out by hand because the generated types do not describe embedded
 * children well.
 */
interface SeriesRow {
  id: string
  title: string
  all_day: boolean
  dtstart: string | null
  duration: string | null
  rrule: string | null
  repeat_count: number | null
  color_key: string | null
  event_person: { person_id: string }[]
  reminder: { id: string; offset_seconds: number }[]
}

/**
 * The `table!fk_column` hints are kept although each remaining child now has a
 * single path to `event_series`. They were required while `checklist_item` was
 * also reachable through `occurrence_item_removed` and the request would fail
 * as ambiguous without them; they are merely explicit now.
 */
const SERIES_SELECT = `id, title, all_day, dtstart, duration, rrule, repeat_count, color_key,
   event_person!series_id ( person_id ),
   reminder!series_id ( id, offset_seconds )`

/**
 * The parsed rule plus its stored count.
 *
 * The count is dropped when the rule itself did not parse into something the
 * app models: a bare count with no recurrence to apply it to would be
 * meaningless, and `rruleToRecurrence` returns undefined for a one-off or an
 * unmodelled frequency.
 */
function withCount(r: Recurrence | undefined, count: number | null): Recurrence | undefined {
  if (!r) return undefined
  return count == null ? r : { ...r, count }
}

/**
 * Every series in the account, dated ones or blueprints.
 *
 * Paged, because a single response stops at 1000 rows and a long-lived account
 * would silently lose the rest.
 */
export async function fetchSeries(
  accountId: string,
  { isTemplate }: { isTemplate: boolean },
): Promise<Series[]> {
  const data = await fetchAll((from, to) =>
    supabase
      .from('event_series')
      .select(SERIES_SELECT)
      .eq('account_id', accountId)
      .eq('is_template', isTemplate)
      .order('id')
      .range(from, to),
  )
  return (data as unknown as SeriesRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    allDay: r.all_day,
    start: r.dtstart ? tsToStart(r.dtstart, r.all_day) : null,
    duration: intervalToDuration(r.duration, r.all_day),
    recurrence: withCount(rruleToRecurrence(r.rrule), r.repeat_count),
    attendees: r.event_person.map((ep) => ep.person_id),
    colorKey: isColorKey(r.color_key) ? r.color_key : undefined,
    reminders: r.reminder.map((rem) => ({
      id: rem.id,
      offset: Math.round(rem.offset_seconds / 60),
    })),
    isTemplate,
  }))
}

/**
 * Save a series and bring its people and reminders in line with it.
 *
 * `isNew` records who created it. It is only stamped on the first save, so a
 * partner editing a series later does not become its author.
 */
export async function saveSeries(
  accountId: string,
  userId: string,
  series: Series,
  { isNew }: { isNew: boolean },
): Promise<void> {
  const row = {
    id: series.id,
    account_id: accountId,
    title: series.title,
    all_day: series.allDay,
    dtstart: series.start ? startToTs(series.start, series.allDay) : null,
    duration: durationToInterval(series.duration, series.allDay),
    rrule: recurrenceToRRule(series.recurrence),
    repeat_count: series.recurrence?.count ?? null,
    color_key: series.colorKey ?? null,
    is_template: series.isTemplate,
    ...(isNew ? { created_by: userId } : {}),
  }
  const up = await supabase.from('event_series').upsert(row, { onConflict: 'id' })
  if (up.error) throw up.error

  await Promise.all([syncAttendees(series), syncReminders(series, userId)])
}

/**
 * Delete a series.
 *
 * The cascade takes its people and attachments with it. Events made from a
 * blueprint are left alone — their link back to it is simply cleared.
 */
export async function deleteSeries(id: string): Promise<void> {
  const { error } = await supabase.from('event_series').delete().eq('id', id)
  if (error) throw error
}

// ---- children ------------------------------------------------------------

async function syncAttendees(series: { id: string; attendees: PersonId[] }): Promise<void> {
  // Add the current people first, then remove whoever is no longer on it.
  // Doing it in this order means the series is never briefly empty for someone
  // reading it at the same time, and two devices saving at once cannot fail the
  // whole write on a shared person's duplicate key.
  if (series.attendees.length) {
    const up = await supabase.from('event_person').upsert(
      series.attendees.map((person_id) => ({ series_id: series.id, person_id })),
      { onConflict: 'series_id,person_id', ignoreDuplicates: true },
    )
    if (up.error) throw up.error
  }
  let del = supabase.from('event_person').delete().eq('series_id', series.id)
  if (series.attendees.length) del = del.not('person_id', 'in', `(${series.attendees.join(',')})`)
  const res = await del
  if (res.error) throw res.error
}

async function syncReminders(series: Series, userId: string): Promise<void> {
  const desired = series.reminders.map((r) => ({
    id: r.id,
    series_id: series.id,
    user_id: userId,
    offset_seconds: Math.round(r.offset * 60),
  }))
  if (desired.length) {
    const up = await supabase.from('reminder').upsert(desired, { onConflict: 'id' })
    if (up.error) throw up.error
  }
  const keepIds = desired.map((d) => d.id)
  // Scoped to this user: reminders are personal, and removing one of your own
  // must not remove a partner's reminder on the same series.
  let del = supabase.from('reminder').delete().eq('series_id', series.id).eq('user_id', userId)
  if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
  const res = await del
  if (res.error) throw res.error
}
