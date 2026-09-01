/**
 * Changing lists, their to-dos, and where a to-do is pinned.
 *
 * All of them share one identity and one order, so writes that depend on each
 * other — create a list, then add to-dos to it — go out in the order they were
 * made, even after a spell offline.
 *
 * Registering asks nothing of the session — the account rides in each write's
 * values — so `registerListsDefaults` can run at start-up before anything is
 * read back out of storage.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { APP_SCOPE } from '../../assets/constants'
import { type Rollback, rollback } from '../../assets/rollback'
import {
  createList,
  createListItem,
  deleteList,
  deleteListItem,
  editListItem,
  linkListItem,
  renameList,
  setListItemDone,
  setListItemDue,
  unlinkListItem,
} from '../../client/lists'
import type { SeriesTiming } from '../../client/series'
import {
  patchAddItem,
  patchAddList,
  patchEditItem,
  patchLink,
  patchRemoveItem,
  patchRemoveList,
  patchRenameList,
  patchSetItemDone,
  patchSetItemDue,
  patchUnlink,
} from './patches'
import { listLinksKey, listsKey } from './queries'
import type { ListItem, TodoList } from './types'

/**
 * Every change, as one set of values that can be written down.
 *
 * A new list or to-do carries its id, minted by the caller before the write, so
 * a second change to the same thing before the first has landed still names
 * something real.
 */
export type ListsChange =
  | { kind: 'addList'; list: TodoList }
  | { kind: 'renameList'; listId: string; title: string }
  | { kind: 'removeList'; listId: string }
  | { kind: 'addItem'; listId: string; item: ListItem }
  | { kind: 'setItemDone'; itemId: string; done: boolean }
  | {
      kind: 'editItem'
      itemId: string
      fields: Pick<ListItem, 'title' | 'personId' | 'groupLabel'>
    }
  | { kind: 'setItemDue'; itemId: string; dueOn: string | null }
  | { kind: 'removeItem'; itemId: string }
  | { kind: 'link'; itemId: string; series: SeriesTiming; date: string }
  | { kind: 'unlink'; itemId: string; series: SeriesTiming; date: string }

/** What `mutate()` takes: the change, and the account it belongs to. */
export type ListsWrite = { accountId: string; change: ListsChange }

const LISTS_WRITE_KEY = ['lists-write'] as const

const isPin = (w: ListsChange) => w.kind === 'link' || w.kind === 'unlink'

export function registerListsDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(LISTS_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: ({ accountId, change: w }: ListsWrite) => {
      switch (w.kind) {
        case 'addList':
          return createList(accountId, w.list)
        case 'renameList':
          return renameList(w.listId, w.title)
        case 'removeList':
          return deleteList(w.listId)
        case 'addItem':
          return createListItem(w.listId, w.item)
        case 'setItemDone':
          return setListItemDone(w.itemId, w.done)
        case 'editItem':
          return editListItem(w.itemId, w.fields)
        case 'setItemDue':
          return setListItemDue(w.itemId, w.dueOn)
        case 'removeItem':
          return deleteListItem(w.itemId)
        case 'link':
          return linkListItem(w.itemId, w.series, w.date)
        case 'unlink':
          return unlinkListItem(w.itemId, w.series, w.date)
      }
    },

    onMutate: async ({ accountId, change: w }: ListsWrite): Promise<Rollback> => {
      const lists = listsKey(accountId)
      const links = listLinksKey(accountId)
      // Pinning touches where to-dos appear, not the lists themselves.
      const key = isPin(w) ? links : lists
      await queryClient.cancelQueries({ queryKey: key })

      if (isPin(w) && (w.kind === 'link' || w.kind === 'unlink')) {
        const previous = queryClient.getQueryData<Record<string, string[]>>(links)
        if (previous) {
          const at = `${w.series.id}:${w.date}`
          queryClient.setQueryData<Record<string, string[]>>(
            links,
            w.kind === 'link'
              ? patchLink(previous, at, w.itemId)
              : patchUnlink(previous, at, w.itemId),
          )
        }
        return { entries: previous ? [[links, previous]] : [] }
      }

      const previous = queryClient.getQueryData<TodoList[]>(lists)
      if (previous) queryClient.setQueryData<TodoList[]>(lists, applyToLists(previous, w))
      return { entries: previous ? [[lists, previous]] : [] }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId, change: w }: ListsWrite) => {
      void queryClient.invalidateQueries({
        queryKey: isPin(w) ? listLinksKey(accountId) : listsKey(accountId),
      })
    },
  })
}

/** The lists as they look with `w` applied. Pinning is handled separately. */
function applyToLists(lists: TodoList[], w: ListsChange): TodoList[] {
  switch (w.kind) {
    case 'addList':
      return patchAddList(lists, w.list)
    case 'renameList':
      return patchRenameList(lists, w.listId, w.title)
    case 'removeList':
      return patchRemoveList(lists, w.listId)
    case 'addItem':
      return patchAddItem(lists, w.listId, w.item)
    case 'setItemDone':
      return patchSetItemDone(lists, w.itemId, w.done)
    case 'editItem':
      return patchEditItem(lists, w.itemId, w.fields)
    case 'setItemDue':
      return patchSetItemDue(lists, w.itemId, w.dueOn)
    case 'removeItem':
      return patchRemoveItem(lists, w.itemId)
    default:
      return lists
  }
}

/**
 * Make a change to the lists.
 *
 * `mutate({ accountId, change: { kind: 'setItemDone', itemId, done: true } })`
 */
export function useListsWrite() {
  return useMutation<void, Error, ListsWrite>({ mutationKey: [...LISTS_WRITE_KEY] })
}
