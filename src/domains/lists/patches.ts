/**
 * What the lists look like the moment an edit is made, before the server has
 * confirmed it.
 *
 * Pure, so the rules a screen shows instantly can be tested without a database
 * or a cache.
 */
import type { ListItem, TodoList } from './types'

const mapList = (lists: TodoList[], listId: string, f: (l: TodoList) => TodoList): TodoList[] =>
  lists.map((l) => (l.id === listId ? f(l) : l))

const mapItem = (lists: TodoList[], itemId: string, f: (i: ListItem) => ListItem): TodoList[] =>
  lists.map((l) =>
    l.items.some((i) => i.id === itemId)
      ? { ...l, items: l.items.map((i) => (i.id === itemId ? f(i) : i)) }
      : l,
  )

/** With a new list added, in its place in the order. */
export function patchAddList(lists: TodoList[], list: TodoList): TodoList[] {
  return [...lists, list].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function patchRenameList(lists: TodoList[], listId: string, title: string): TodoList[] {
  return mapList(lists, listId, (l) => ({ ...l, title }))
}

/** With a list gone, and its to-dos with it — which is what the database does too. */
export function patchRemoveList(lists: TodoList[], listId: string): TodoList[] {
  return lists.filter((l) => l.id !== listId)
}

/** With a to-do added to the end of its list. */
export function patchAddItem(lists: TodoList[], listId: string, item: ListItem): TodoList[] {
  return mapList(lists, listId, (l) => ({ ...l, items: [...l.items, item] }))
}

export function patchSetItemDone(lists: TodoList[], itemId: string, done: boolean): TodoList[] {
  return mapItem(lists, itemId, (i) => ({ ...i, done }))
}

export function patchEditItem(
  lists: TodoList[],
  itemId: string,
  fields: Pick<ListItem, 'title' | 'personId' | 'groupLabel'>,
): TodoList[] {
  return mapItem(lists, itemId, (i) => ({ ...i, ...fields }))
}

export function patchSetItemDue(
  lists: TodoList[],
  itemId: string,
  dueOn: string | null,
): TodoList[] {
  return mapItem(lists, itemId, (i) => ({ ...i, dueOn }))
}

/** With a to-do gone from whichever list it was in. */
export function patchRemoveItem(lists: TodoList[], itemId: string): TodoList[] {
  return lists.map((l) =>
    l.items.some((i) => i.id === itemId)
      ? { ...l, items: l.items.filter((i) => i.id !== itemId) }
      : l,
  )
}

/** With a to-do pinned to a day of an event. Pinning the same one twice changes nothing. */
export function patchLink(
  links: Record<string, string[]>,
  key: string,
  itemId: string,
): Record<string, string[]> {
  const at = links[key] ?? []
  if (at.includes(itemId)) return links
  return { ...links, [key]: [...at, itemId] }
}

/** With a to-do unpinned from a day. The day's entry goes when nothing is left on it. */
export function patchUnlink(
  links: Record<string, string[]>,
  key: string,
  itemId: string,
): Record<string, string[]> {
  const at = links[key]
  if (!at) return links
  const rest = at.filter((id) => id !== itemId)
  if (rest.length) return { ...links, [key]: rest }
  const { [key]: _gone, ...others } = links
  return others
}
