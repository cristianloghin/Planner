/**
 * Putting the rows into the shapes screens read.
 *
 * Used only inside this domain — a screen never calls these. They exist as
 * their own functions, rather than happening inside a fetch, so the shaping can
 * be tested without a database.
 */
import type { ListItemRow, ListLink, TodoList } from './types'

/**
 * Every list with its to-dos inside, in order.
 *
 * Lists and to-dos are read separately in one pass each, so this is where they
 * are put together. Items are sorted again after grouping: the query orders
 * them, but they arrive across several pages and a list's items can be split
 * between two of them.
 *
 * A list with nothing in it still appears — an empty list is a real thing a
 * user made, not an absence.
 */
export function nestItems(
  lists: { id: string; title: string; sortOrder: number }[],
  items: ListItemRow[],
): TodoList[] {
  const byList = new Map<string, ListItemRow[]>()
  for (const item of items) {
    const arr = byList.get(item.listId)
    if (arr) arr.push(item)
    else byList.set(item.listId, [item])
  }
  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    sortOrder: l.sortOrder,
    items: (byList.get(l.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  }))
}

/**
 * To-dos pinned to a day, looked up by that day.
 *
 * Keyed `${seriesId}:${date}`, the same key per-day occurrence state uses, so a
 * screen showing one day can read both with the same string. Values are to-do
 * ids; the to-do itself, and whether it is ticked, lives in its list.
 */
export function linksByOccurrence(links: ListLink[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const link of links) {
    const key = `${link.seriesId}:${link.date}`
    const at = out[key]
    if (at) at.push(link.listItemId)
    else out[key] = [link.listItemId]
  }
  return out
}
