/**
 * Lists and the to-dos in them.
 *
 * A to-do is stored the way the app uses it, so that shape comes from the
 * client. A list *with its to-dos inside* is different: they are separate rows,
 * read separately, and only put together because that is how a screen wants
 * them. So this domain owns that one.
 */
import type { ListItem } from '../../client/lists'

export type { List, ListItem, ListItemRow, ListLink } from '../../client/lists'

/** A named list with its to-dos, in order. */
export interface TodoList {
  id: string
  title: string
  /** List order, ascending. */
  sortOrder: number
  items: ListItem[]
}
