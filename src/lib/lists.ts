import type { AppState, ListItem, TodoList } from '../types'
import { diffDays, toISODate } from './dates'

/**
 * Locate a to-do by id across every list, returning it with its owning list (so
 * a caller holding only an item id — e.g. a linked to-do inside an occurrence —
 * can dispatch list actions that need the `listId`). `null` if it's gone.
 */
export function findListItem(
  state: AppState,
  itemId: string,
): { list: TodoList; item: ListItem } | null {
  for (const list of state.lists) {
    const item = list.items.find((i) => i.id === itemId)
    if (item) return { list, item }
  }
  return null
}

/** An open to-do is overdue when its deadline is strictly before today. */
export function isOverdue(item: ListItem): boolean {
  return !item.done && item.dueOn != null && diffDays(item.dueOn, toISODate(new Date())) < 0
}
