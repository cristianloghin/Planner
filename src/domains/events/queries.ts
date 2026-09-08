/**
 * Reading events and blueprints.
 *
 * Both are the same table, read with the same call and told apart by whether
 * they have a date. Two queries and two caches, because they are two different
 * things to a screen and adding a blueprint should not redraw the calendar.
 *
 * What happened on which days is read a window at a time — see
 * `useOccurrencesForRange` below.
 */
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { addDays } from '../../assets/utils/dates'
import { fetchOccurrenceRows } from '../../client/occurrences'
import { fetchSeries } from '../../client/series'
import { indexOccurrences, toEvent, toOccurrences, toTemplate } from './transformers'
import type { CalendarEvent, EventTemplate, OccurrenceIndex, OccurrenceMap } from './types'

export const eventsKey = (accountId: string | null) => ['events', accountId] as const
export const templatesKey = (accountId: string | null) => ['templates', accountId] as const

const STALE_MS = 5 * 60_000

/**
 * Every event in the account.
 *
 * The whole account, not a date range: an event is a repeating pattern, and
 * which days it lands on is worked out from the pattern rather than read. What
 * happened on any one of those days is read per window — see `useOccurrencesForRange`.
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

// ---- what happened on which days ----
//
// Read a window at a time, not all at once: a screen loads the month it is
// showing plus a margin, so start-up stays the same speed however old the
// account gets. One query per calendar month. Windows overlap on purpose, so a
// change has to be applied to every cached month that covers the day — see
// ./mutations.

/** Everything cached for an account's days, for invalidating the lot. */
export const occurrencesPrefix = (accountId: string | null) => ['occurrences', accountId] as const
const occurrencesKey = (accountId: string | null, month: string) =>
  ['occurrences', accountId, month] as const

// A month is fetched with margins. Back, so an event that STARTS before the
// month but runs into it still has its row (which sits on its start date).
// Forward, so the trailing cells of a month grid are covered. A day moved in
// from further away than that is caught by the query itself, not by these.
const BACK_MARGIN_DAYS = 31
const FWD_MARGIN_DAYS = 7

const monthOf = (date: string) => date.slice(0, 7)
const monthStart = (month: string) => `${month}-01`

function shiftMonth(month: string, delta: 1 | -1): string {
  const [y, m] = month.split('-').map(Number)
  const n = m + delta
  if (n === 0) return `${y - 1}-12`
  if (n === 13) return `${y + 1}-01`
  return `${y}-${String(n).padStart(2, '0')}`
}

function fetchBounds(month: string): { from: string; to: string } {
  return {
    from: addDays(monthStart(month), -BACK_MARGIN_DAYS),
    to: addDays(monthStart(shiftMonth(month, 1)), FWD_MARGIN_DAYS),
  }
}

/** The months whose windows cover [from, to]. */
function monthsFor(from: string, to: string): string[] {
  const months = new Set<string>()
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) months.add(m)
  return [...months].sort()
}

async function fetchMonth(accountId: string, month: string): Promise<OccurrenceMap> {
  const { from, to } = fetchBounds(month)
  return toOccurrences(await fetchOccurrenceRows(accountId, from, to))
}

/**
 * Merge the months into one object, keeping the same object while the parts
 * behind it are unchanged — so work further downstream is not redone on every
 * render.
 */
function useStableMerge(parts: (OccurrenceMap | undefined)[]): OccurrenceMap {
  const ref = useRef<{ parts: (OccurrenceMap | undefined)[]; merged: OccurrenceMap }>()
  if (
    !ref.current ||
    ref.current.parts.length !== parts.length ||
    parts.some((p, i) => p !== ref.current?.parts[i])
  ) {
    ref.current = { parts, merged: Object.assign({}, ...parts.filter(Boolean)) }
  }
  return ref.current.merged
}

/**
 * What happened on the days from `from` to `to`, inclusive, as lookups. Pass
 * `from` as null to fetch nothing.
 *
 * The months either side are fetched quietly too, so swiping across a month
 * boundary does not stall.
 */
export function useOccurrencesForRange(
  accountId: string | null,
  from: string | null,
  to?: string | null,
): { occurrences: OccurrenceIndex; isLoading: boolean } {
  const queryClient = useQueryClient()

  const months = useMemo(() => (from ? monthsFor(from, to ?? from) : []), [from, to])

  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: occurrencesKey(accountId, month),
      queryFn: () => fetchMonth(accountId as string, month),
      enabled: accountId != null,
      staleTime: STALE_MS,
    })),
  })

  const monthsKey = months.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on monthsKey so the same months with a fresh array identity do not refetch
  useEffect(() => {
    if (accountId == null || !months.length) return
    for (const m of [shiftMonth(months[0], -1), shiftMonth(months[months.length - 1], 1)]) {
      void queryClient.prefetchQuery({
        queryKey: occurrencesKey(accountId, m),
        queryFn: () => fetchMonth(accountId, m),
        staleTime: STALE_MS,
      })
    }
  }, [accountId, queryClient, monthsKey])

  const merged = useStableMerge(results.map((r) => r.data))
  const occurrences = useMemo(() => indexOccurrences(merged), [merged])

  return {
    occurrences,
    // A fetch paused because there is no connection is not "loading" — nothing
    // is coming until it returns, and the offline notice says so. A spinner
    // here would sit there forever.
    isLoading: results.some((r) => r.isPending && r.fetchStatus === 'fetching'),
  }
}
