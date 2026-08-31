/**
 * Event series (`event_series`) and everything hanging off one: who is on it,
 * and its notes, checklists and reminders.
 *
 * One table, one module. A series with a date is an event; a series without one
 * is a blueprint to make events from (`is_template`). They are the same row with
 * the same children, so they are read and written by the same code here. What
 * the app calls them, and how it splits them into its own shapes, is the app's
 * business.
 */
import { type ColorKey, isColorKey } from '../lib/palette'
import { recurrenceToRRule, rruleToRecurrence, truncatedRRule } from '../lib/rrule'
import {
  durationToInterval,
  intervalToDuration,
  occurrenceTs,
  startToTs,
  tsToStart,
} from './mappers'
import { fetchAll } from './pagination'
import type { PersonId } from './people'
import { supabase } from './supabase'

/** How often a series repeats. */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Repeat every N units (at least 1): every 2 days, every 3 weeks... */
  interval: number
  /**
   * Last day the series may produce an occurrence, as `yyyy-mm-dd`. Absent means
   * it repeats forever.
   */
  until?: string
}

/** One line of a checklist. Whether it is ticked is per-day state, kept elsewhere. */
export interface ChecklistEntry {
  id: string
  title: string
}

/**
 * Something attached to a series: free text, a checklist, or a reminder a number
 * of minutes before the start.
 */
export type Attachment =
  | { id: string; kind: 'note'; text: string }
  | { id: string; kind: 'checklist'; title?: string; items: ChecklistEntry[] }
  | { id: string; kind: 'reminder'; offset: number }

/**
 * One series, with its people and attachments.
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
  attachments: Attachment[]
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
  color_key: string | null
  event_person: { person_id: string }[]
  checklist_item: {
    id: string
    label: string
    group_label: string | null
    sort_order: number
    occurrence_start: string | null
  }[]
  note: { id: string; body: string }[]
  reminder: { id: string; offset_seconds: number }[]
}

/**
 * The `table!fk_column` hints are required, not decoration: there is more than
 * one relationship between `event_series` and some of these children (for one,
 * `checklist_item` is also reachable through `occurrence_item_removed`), and
 * without the hint the request fails as ambiguous.
 */
const SERIES_SELECT = `id, title, all_day, dtstart, duration, rrule, color_key,
   event_person!series_id ( person_id ),
   checklist_item!owner_series_id ( id, label, group_label, sort_order, occurrence_start ),
   note!owner_series_id ( id, body ),
   reminder!series_id ( id, offset_seconds )`

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
    recurrence: rruleToRecurrence(r.rrule),
    attendees: r.event_person.map((ep) => ep.person_id),
    colorKey: isColorKey(r.color_key) ? r.color_key : undefined,
    attachments: rebuildAttachments(r),
    isTemplate,
  }))
}

/**
 * Save a series and bring its people and attachments in line with it.
 *
 * `isNew` records who created it. It is only stamped on the first save, so a
 * partner editing a series later does not become its author.
 *
 * `templateId` records which blueprint a series was made from. It is only sent
 * when given, so an ordinary edit never clears an existing link.
 */
export async function saveSeries(
  accountId: string,
  userId: string,
  series: Series,
  { isNew, templateId }: { isNew: boolean; templateId?: string },
): Promise<void> {
  const row = {
    id: series.id,
    account_id: accountId,
    title: series.title,
    all_day: series.allDay,
    dtstart: series.start ? startToTs(series.start, series.allDay) : null,
    duration: durationToInterval(series.duration, series.allDay),
    rrule: recurrenceToRRule(series.recurrence),
    color_key: series.colorKey ?? null,
    is_template: series.isTemplate,
    ...(templateId ? { template_id: templateId } : {}),
    ...(isNew ? { created_by: userId } : {}),
  }
  const up = await supabase.from('event_series').upsert(row, { onConflict: 'id' })
  if (up.error) throw up.error

  await Promise.all([
    syncAttendees(series),
    syncChecklist(series),
    syncNotes(series, userId),
    syncReminders(series, userId),
  ])
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

/**
 * Split a repeating series in two at `fromDate`, and apply `edits` to the new
 * half. Returns the new series' id.
 *
 * For "change this one and all the ones after it". The old series stops
 * repeating the day before `fromDate`, and a copy takes over from `fromDate`
 * onwards carrying the edits. Days already passed keep what they had.
 *
 * The database does the split in one transaction: it makes the copy, moves the
 * ticks, people and notes on or after the cutover onto it, and caps the old
 * one's repeat rule. Both the cutover and the capped rule are worked out here
 * from `old`, so they line up with a real day of that series — a cutover that
 * is not one silently reschedules the event and strands its rows.
 *
 * `edits` deliberately cannot carry attachments. The database already copied
 * the notes, checklists and reminders onto the new series and gave them new
 * ids, so writing the ones the app is holding would write the wrong rows.
 */
export async function splitSeries(
  old: SeriesTiming & { recurrence: Recurrence },
  fromDate: string,
  edits: Omit<Series, 'id' | 'attachments' | 'isTemplate'>,
): Promise<string> {
  const { data: newId, error: rpcErr } = await supabase.rpc('split_series', {
    p_series: old.id,
    p_cutover: occurrenceTs(old, fromDate),
    p_truncated_rrule: truncatedRRule(old.recurrence, fromDate),
  })
  if (rpcErr) throw rpcErr

  const up = await supabase
    .from('event_series')
    .update({
      title: edits.title,
      all_day: edits.allDay,
      dtstart: edits.start ? startToTs(edits.start, edits.allDay) : null,
      duration: durationToInterval(edits.duration, edits.allDay),
      rrule: recurrenceToRRule(edits.recurrence),
      color_key: edits.colorKey ?? null,
    })
    .eq('id', newId)
  if (up.error) throw up.error

  await syncAttendees({ id: newId, attendees: edits.attendees })
  return newId
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

async function syncChecklist(series: Series): Promise<void> {
  // Update the rows that are still there and delete only the ones that went
  // away — never delete everything and re-insert, which would take every tick
  // recorded against those lines with it.
  const desired = series.attachments
    .filter((a): a is Extract<Attachment, { kind: 'checklist' }> => a.kind === 'checklist')
    .flatMap((c, ci) =>
      c.items.map((item, idx) => ({
        id: item.id,
        owner_series_id: series.id,
        label: item.title,
        group_label: c.title ?? null,
        // Encodes which checklist a line belongs to and its place in it, so the
        // grouping can be rebuilt on the way back out.
        sort_order: ci * 1000 + idx,
        required: true,
        occurrence_start: null as string | null,
      })),
    )
  if (desired.length) {
    const up = await supabase.from('checklist_item').upsert(desired, { onConflict: 'id' })
    if (up.error) throw up.error
  }
  const keepIds = desired.map((d) => d.id)
  // Only rows belonging to the series itself: a checklist line added to one
  // single day carries that day and is not ours to remove.
  let del = supabase
    .from('checklist_item')
    .delete()
    .eq('owner_series_id', series.id)
    .is('occurrence_start', null)
  if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
  const res = await del
  if (res.error) throw res.error
}

async function syncNotes(series: Series, userId: string): Promise<void> {
  // Keep whoever wrote a note as its author: editing a series must not reassign
  // a partner's notes to whoever saved last.
  const { data: existing, error: exErr } = await supabase
    .from('note')
    .select('id, author_id')
    .eq('owner_series_id', series.id)
  if (exErr) throw exErr
  const authorById = new Map((existing ?? []).map((n) => [n.id, n.author_id]))
  const desired = series.attachments
    .filter((a): a is Extract<Attachment, { kind: 'note' }> => a.kind === 'note')
    .map((n) => ({
      id: n.id,
      owner_series_id: series.id,
      body: n.text,
      author_id: authorById.get(n.id) ?? userId,
    }))
  if (desired.length) {
    const up = await supabase.from('note').upsert(desired, { onConflict: 'id' })
    if (up.error) throw up.error
  }
  const keepIds = desired.map((d) => d.id)
  let del = supabase.from('note').delete().eq('owner_series_id', series.id)
  if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
  const res = await del
  if (res.error) throw res.error
}

async function syncReminders(series: Series, userId: string): Promise<void> {
  const desired = series.attachments
    .filter((a): a is Extract<Attachment, { kind: 'reminder' }> => a.kind === 'reminder')
    .map((r) => ({
      id: r.id,
      series_id: series.id,
      user_id: userId,
      offset_seconds: Math.round(r.offset * 60),
      method: 'app',
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

/**
 * Rebuild the attachments from the child rows.
 *
 * The database does not record the order the three kinds were authored in, so
 * they come back grouped — checklists, then notes, then reminders. The contents
 * survive a round trip; interleaving them does not.
 */
function rebuildAttachments(r: SeriesRow): Attachment[] {
  const out: Attachment[] = []

  // Sort before grouping: rows arrive in no particular order, and sort_order is
  // what says which checklist a line belongs to and where it sits, so walking
  // the sorted rows reproduces the original grouping every time.
  const lines = r.checklist_item
    .filter((c) => c.occurrence_start === null)
    .sort((a, b) => a.sort_order - b.sort_order)
  const groups = new Map<string, typeof lines>()
  for (const line of lines) {
    const key = line.group_label ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)?.push(line)
  }
  for (const [groupLabel, items] of groups) {
    out.push({
      // Derived from the series and the heading so a checklist keeps the same
      // identity across reloads.
      id: `${r.id}:checklist:${groupLabel}`,
      kind: 'checklist',
      title: groupLabel || undefined,
      items: items.map((i) => ({ id: i.id, title: i.label })),
    })
  }

  for (const n of r.note) out.push({ id: n.id, kind: 'note', text: n.body })
  for (const rem of r.reminder)
    out.push({ id: rem.id, kind: 'reminder', offset: Math.round(rem.offset_seconds / 60) })

  return out
}
