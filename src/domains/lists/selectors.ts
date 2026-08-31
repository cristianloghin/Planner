/**
 * Ways for a screen to ask for part of the lists.
 *
 * For call sites to pass into `useLists`. The ones ending in `For` need an
 * argument first and build a function, so hold the result with `useMemo`.
 */
import { diffDays, toISODate } from '../../lib/dates'
import type { ListItem, TodoList } from './types'

/** One list, or undefined if it has been deleted. */
export function listFor(listId: string) {
  return (lists: TodoList[]): TodoList | undefined => lists.find((l) => l.id === listId)
}

/** Just the to-dos of one list, so a screen showing it ignores the others. */
export function itemsOfFor(listId: string) {
  return (lists: TodoList[]): ListItem[] => lists.find((l) => l.id === listId)?.items ?? []
}

/**
 * A to-do and the list it is in, found by id alone.
 *
 * For a caller holding only an id — a to-do pinned to a day of an event knows
 * nothing about which list it came from, but editing it needs to know.
 */
export function findItemFor(itemId: string) {
  return (lists: TodoList[]): { list: TodoList; item: ListItem } | undefined => {
    for (const list of lists) {
      const item = list.items.find((i) => i.id === itemId)
      if (item) return { list, item }
    }
    return undefined
  }
}

/** The to-dos with these ids, wherever they live — for the ones pinned to a day. */
export function itemsByIdFor(itemIds: string[]) {
  return (lists: TodoList[]): ListItem[] => {
    const wanted = new Set(itemIds)
    return lists.flatMap((l) => l.items.filter((i) => wanted.has(i.id)))
  }
}

/** The lists, without their to-dos — for a picker that only shows names. */
export function listNames(lists: TodoList[]): { id: string; title: string }[] {
  return lists.map((l) => ({ id: l.id, title: l.title }))
}

/**
 * An open to-do is overdue once its deadline is behind us. A done one never is,
 * however late it was.
 *
 * Not a `useLists` selector — it takes one to-do. Reads today's date, so it
 * changes at midnight without anything being refetched.
 */
export function isOverdue(item: ListItem): boolean {
  return !item.done && item.dueOn != null && diffDays(item.dueOn, toISODate(new Date())) < 0
}
