/**
 * Named lists (`list`) and the to-dos in them (`list_item`).
 *
 * Lists are account-wide, so everyone in the account sees the same ones. A
 * to-do's `done` lives on the item itself rather than per day, because a to-do
 * is ticked once and stays ticked — unlike an event's checklist, which is
 * ticked separately on every occurrence.
 */
import { dayRange, occurrenceTs, tsToDateKey } from './mappers'
import { fetchAll } from './pagination'
import type { PersonId } from './people'
import type { SeriesTiming } from './series'
import { supabase } from './supabase'

/** One to-do inside a list. */
export interface ListItem {
  id: string
  title: string
  done: boolean
  /** Who it's for, or null when it's shared. */
  personId: PersonId | null
  /** In-list section header; null means ungrouped. */
  groupLabel: string | null
  /** Optional deadline, as `yyyy-mm-dd`; null means none. */
  dueOn: string | null
  /** Position within the list, ascending. */
  sortOrder: number
  /** When it was created, as milliseconds since the epoch. */
  createdAt: number
}

/**
 * A to-do as it is stored: on its own, carrying the list it belongs to.
 *
 * Reading every to-do in the account is one query across all lists, so each row
 * has to say which list it came from. Putting them back under their lists drops
 * nothing — a row is a {@link ListItem} with one extra field.
 */
export interface ListItemRow extends ListItem {
  listId: string
}

/**
 * A named list, without its to-dos.
 *
 * The two are separate rows and are read separately. Putting the items inside
 * their list is a shape for the screen, not for the database — see
 * domains/lists/transformers.
 */
export interface List {
  id: string
  title: string
  /** List order, ascending. */
  sortOrder: number
}

/** One row tying a to-do to a day of an event. */
export interface ListLink {
  listItemId: string
  seriesId: string
  /** The day it is pinned to, as `yyyy-mm-dd`. */
  date: string
}

/** Every list in the account, in order. Their to-dos are read separately. */
export async function fetchLists(accountId: string): Promise<List[]> {
  const { data, error } = await supabase
    .from('list')
    .select('id, title, sort_order')
    .eq('account_id', accountId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((l) => ({ id: l.id, title: l.title, sortOrder: l.sort_order }))
}

/**
 * Every to-do in the account, across all lists, in order.
 *
 * Read in one pass rather than one query per list, and paged, since a single
 * response stops at 1000 rows and a busy account would lose the rest. Each
 * carries the list it belongs to, for whoever puts them back together.
 */
export async function fetchListItems(accountId: string): Promise<ListItemRow[]> {
  // Scoped to the account through the parent list.
  const rows = await fetchAll((from, to) =>
    supabase
      .from('list_item')
      .select(
        'id, list_id, group_label, title, done, person_id, due_on, sort_order, created_at, list!inner()',
      )
      .eq('list.account_id', accountId)
      .order('sort_order')
      .order('id')
      .range(from, to),
  )
  return rows.map((it) => ({
    id: it.id,
    listId: it.list_id,
    title: it.title,
    done: it.done,
    personId: it.person_id,
    groupLabel: it.group_label,
    dueOn: it.due_on,
    sortOrder: it.sort_order,
    createdAt: Date.parse(it.created_at),
  }))
}

/**
 * Create a list. Items are added separately with {@link createListItem} — this
 * writes the list row only, so `items` is ignored.
 */
export async function createList(accountId: string, list: List): Promise<void> {
  const { error } = await supabase.from('list').insert({
    id: list.id,
    account_id: accountId,
    title: list.title,
    sort_order: list.sortOrder,
  })
  if (error) throw error
}

export async function renameList(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('list').update({ title }).eq('id', id)
  if (error) throw error
}

/**
 * Delete a list. The database cascade takes its items with it, along with any
 * links tying those items to an occurrence.
 */
export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('list').delete().eq('id', id)
  if (error) throw error
}

/**
 * Add a to-do to a list. `createdAt` is set by the database, so whatever the
 * caller has in that field is not sent.
 */
export async function createListItem(listId: string, item: ListItem): Promise<void> {
  const { error } = await supabase.from('list_item').insert({
    id: item.id,
    list_id: listId,
    title: item.title,
    done: item.done,
    person_id: item.personId,
    group_label: item.groupLabel,
    due_on: item.dueOn,
    sort_order: item.sortOrder,
  })
  if (error) throw error
}

/**
 * Tick or untick a to-do. Takes the value to store rather than flipping what is
 * there, so repeating the write lands on the same result.
 */
export async function setListItemDone(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('list_item').update({ done }).eq('id', itemId)
  if (error) throw error
}

/** Edit a to-do's text, who it's for, and its section header, in one write. */
export async function editListItem(
  itemId: string,
  fields: { title: string; personId: PersonId | null; groupLabel: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('list_item')
    .update({
      title: fields.title,
      person_id: fields.personId,
      group_label: fields.groupLabel,
    })
    .eq('id', itemId)
  if (error) throw error
}

/** Set a to-do's deadline, or clear it with null. */
export async function setListItemDue(itemId: string, dueOn: string | null): Promise<void> {
  const { error } = await supabase.from('list_item').update({ due_on: dueOn }).eq('id', itemId)
  if (error) throw error
}

export async function deleteListItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('list_item').delete().eq('id', itemId)
  if (error) throw error
}

// ---- to-dos shown on a day of an event -----------------------------------

/**
 * Every to-do pinned to a day of an event.
 *
 * Rows, not a lookup: grouping them by the day they appear on is a shape for
 * the screen (see domains/lists/transformers). A to-do can be pinned to several
 * days, and ticking it anywhere is the same single tick — the to-do itself
 * lives in its list.
 *
 * Paged, since one response stops at 1000 rows.
 */
export async function fetchListLinks(accountId: string): Promise<ListLink[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from('list_item_event_link')
      // Scoped to the account through the event, which also stops a user who
      // belongs to more than one account pulling in the others' rows.
      .select('list_item_id, series_id, occurrence_start, event_series!inner()')
      .eq('event_series.account_id', accountId)
      .order('list_item_id')
      .order('series_id')
      .order('occurrence_start')
      .range(from, to),
  )
  return rows.map((r) => ({
    listItemId: r.list_item_id,
    seriesId: r.series_id,
    date: tsToDateKey(r.occurrence_start),
  }))
}

/**
 * Pin a to-do to one day of an event.
 *
 * Any existing pin for that same day is cleared first. A pin made before the
 * event's time was edited sits at the old time of day, so without clearing by
 * day the same to-do would end up pinned to that day twice.
 */
export async function linkListItem(
  itemId: string,
  series: SeriesTiming,
  date: string,
): Promise<void> {
  const { from, to } = dayRange(date)
  const del = await supabase
    .from('list_item_event_link')
    .delete()
    .eq('list_item_id', itemId)
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
  if (del.error) throw del.error
  const { error } = await supabase.from('list_item_event_link').upsert(
    {
      list_item_id: itemId,
      series_id: series.id,
      occurrence_start: occurrenceTs(series, date),
    },
    { onConflict: 'list_item_id,series_id,occurrence_start' },
  )
  if (error) throw error
}

/**
 * Unpin a to-do from one day of an event. The to-do itself is untouched — it
 * stays in its list, ticked or not.
 *
 * Cleared by day rather than by exact timestamp, so a pin made before the
 * event's time was edited is still found.
 */
export async function unlinkListItem(
  itemId: string,
  series: SeriesTiming,
  date: string,
): Promise<void> {
  const { from, to } = dayRange(date)
  const { error } = await supabase
    .from('list_item_event_link')
    .delete()
    .eq('list_item_id', itemId)
    .eq('series_id', series.id)
    .gte('occurrence_start', from)
    .lt('occurrence_start', to)
  if (error) throw error
}
