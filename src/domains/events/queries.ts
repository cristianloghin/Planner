/**
 * Reading events and blueprints.
 *
 * Both are the same table, read with the same call and told apart by whether
 * they have a date. Two queries and two caches, because they are two different
 * things to a screen and adding a blueprint should not redraw the calendar.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchSeries } from '../../client/series'
import { toEvent, toTemplate } from './transformers'
import type { CalendarEvent, EventTemplate } from './types'

export const eventsKey = (accountId: string | null) => ['events', accountId] as const
export const templatesKey = (accountId: string | null) => ['templates', accountId] as const

const STALE_MS = 5 * 60_000

/**
 * Every event in the account.
 *
 * The whole account, not a date range: an event is a repeating pattern, and
 * which days it lands on is worked out from the pattern rather than read. What
 * happened on any one of those days is read per window — see domains/occurrences.
 */
export function useEvents<T = CalendarEvent[]>(
  accountId: string | null,
  select?: (events: CalendarEvent[]) => T,
) {
  return useQuery({
    queryKey: eventsKey(accountId),
    queryFn: async () =>
      (await fetchSeries(accountId as string, { isTemplate: false })).map(toEvent),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}

/** Every blueprint in the account. */
export function useTemplates<T = EventTemplate[]>(
  accountId: string | null,
  select?: (templates: EventTemplate[]) => T,
) {
  return useQuery({
    queryKey: templatesKey(accountId),
    queryFn: async () =>
      (await fetchSeries(accountId as string, { isTemplate: true })).map(toTemplate),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}
