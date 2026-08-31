/**
 * Reading what happened on which days.
 *
 * Read a window at a time, not all at once: these rows grow with every tick
 * ever made, so a screen loads the month it is showing plus a margin, and
 * start-up stays the same speed however old the account gets.
 *
 * One query per calendar month. Windows overlap on purpose, so a change has to
 * be applied to every cached month that covers the day — see ./mutations.
 */
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import {
  fetchDependencies,
  fetchItemStateRows,
  fetchOccurrenceRows,
} from '../../client/occurrences'
import { addDays } from '../../lib/dates'
import { dependenciesByOccurrence, toCompletions } from './transformers'
import type { CompletionsMap, OccurrenceDependency } from './types'

/** Everything this domain caches for an account, for invalidating the lot. */
export const completionsPrefix = (accountId: string | null) => ['completions', accountId] as const
const completionsKey = (accountId: string | null, month: string) =>
  ['completions', accountId, month] as const
export const dependenciesKey = (accountId: string | null) => ['dependencies', accountId] as const

const STALE_MS = 5 * 60_000

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

/** The months whose windows cover [from, to], plus any odd extra dates. */
function monthsFor(from: string, to: string, extraDates: string[]): string[] {
  const months = new Set<string>()
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) months.add(m)
  for (const d of extraDates) months.add(monthOf(d))
  return [...months].sort()
}

async function fetchMonth(accountId: string, month: string): Promise<CompletionsMap> {
  const { from, to } = fetchBounds(month)
  const [occurrences, itemStates] = await Promise.all([
    fetchOccurrenceRows(accountId, from, to),
    fetchItemStateRows(accountId, from, to),
  ])
  return toCompletions(occurrences, itemStates)
}

/**
 * Merge the months into one object, keeping the same object while the parts
 * behind it are unchanged — so work further downstream is not redone on every
 * render.
 */
function useStableMerge(parts: (CompletionsMap | undefined)[]): CompletionsMap {
  const ref = useRef<{ parts: (CompletionsMap | undefined)[]; merged: CompletionsMap }>()
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
 * What happened on the days from `from` to `to`, inclusive, plus any
 * `extraDates` — days referenced from inside the range, such as one another day
 * is waiting on. Pass `from` as null to fetch nothing.
 *
 * The months either side are fetched quietly too, so swiping across a month
 * boundary does not stall.
 */
export function useCompletionsForRange(
  accountId: string | null,
  from: string | null,
  to?: string | null,
  extraDates: string[] = [],
): { completions: CompletionsMap; isLoading: boolean } {
  const queryClient = useQueryClient()

  const extraKey = extraDates.join(',')
  const months = useMemo(
    () => (from ? monthsFor(from, to ?? from, extraKey ? extraKey.split(',') : []) : []),
    [from, to, extraKey],
  )

  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: completionsKey(accountId, month),
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
        queryKey: completionsKey(accountId, m),
        queryFn: () => fetchMonth(accountId, m),
        staleTime: STALE_MS,
      })
    }
  }, [accountId, queryClient, monthsKey])

  return {
    completions: useStableMerge(results.map((r) => r.data)),
    // A fetch paused because there is no connection is not "loading" — nothing
    // is coming until it returns, and the offline notice says so. A spinner
    // here would sit there forever.
    isLoading: results.some((r) => r.isPending && r.fetchStatus === 'fetching'),
  }
}

/**
 * What every day is waiting on, keyed by the day doing the waiting.
 *
 * All of them, not windowed: there are few, and a day can wait on one far
 * outside whatever window is on screen.
 */
export function useDependencies<T = Record<string, OccurrenceDependency[]>>(
  accountId: string | null,
  select?: (deps: Record<string, OccurrenceDependency[]>) => T,
) {
  return useQuery({
    queryKey: dependenciesKey(accountId),
    queryFn: async () => dependenciesByOccurrence(await fetchDependencies(accountId as string)),
    enabled: accountId != null,
    staleTime: STALE_MS,
    select,
  })
}
