/**
 * Reading lists and their to-dos.
 *
 * Lists and to-dos are two reads that are only useful together, so they are one
 * query holding the finished shape rather than two a screen has to join up.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchListItems, fetchListLinks, fetchLists } from '../../client/lists'
import { linksByOccurrence, nestItems } from './transformers'
import type { TodoList } from './types'

export const listsKey = (accountId: string | null) => ['lists', accountId] as const
export const listLinksKey = (accountId: string | null) => ['list-links', accountId] as const

const STALE_MS = 5 * 60_000

/**
 * Every list with its to-dos inside.
 *
 * Pass a selector from ./selectors to narrow it — a screen showing one list
 * should not re-render when another one changes.
 */
export function useLists<T = TodoList[]>(
  accountId: string | null,
  select?: (lists: TodoList[]) => T,
) {
  return useQuery({
    queryKey: listsKey(accountId),
    queryFn: async () => {
      const id = accountId as string
      const [lists, items] = await Promise.all([fetchLists(id), fetchListItems(id)])
      return nestItems(lists, items)
    },
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}

/**
 * Which to-dos are pinned to which day, looked up by `${seriesId}:${date}`.
 *
 * Its own query, not part of the lists one: a day of an event needs this
 * without needing every list, and pinning a to-do does not change any list.
 */
export function useListLinks<T = Record<string, string[]>>(
  accountId: string | null,
  select?: (links: Record<string, string[]>) => T,
) {
  return useQuery({
    queryKey: listLinksKey(accountId),
    queryFn: async () => linksByOccurrence(await fetchListLinks(accountId as string)),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}
