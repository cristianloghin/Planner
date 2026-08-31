/**
 * Recording what happened on one day, and what a day is waiting on.
 *
 * Call `registerOccurrencesDefaults` once at start-up, after the account is
 * known and before any paused writes are resumed.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import {
  type OccurrenceStatusCode,
  addDependency,
  cancelOccurrence,
  clearOccurrenceOverride,
  removeDependency,
  setChecklistEntry,
  setOccurrenceOverride,
  setOccurrenceStatus,
} from '../../client/occurrences'
import type { SeriesTiming } from '../../client/series'
import {
  type OccurrenceChange,
  patchAddDependency,
  patchCompletions,
  patchRemoveDependency,
} from './patches'
import { completionsPrefix, dependenciesKey } from './queries'
import { occurrenceKey } from './transformers'
import type { CompletionsMap, OccurrenceDependency } from './types'

/**
 * Every change, as one set of values that can be written down.
 *
 * Each carries the event's timing rather than the whole event, because that is
 * all a write needs to find the right day — and because a set of values that
 * has to survive a restart should be as small as it can be.
 */
export type OccurrencesWrite =
  | { kind: 'status'; series: SeriesTiming; date: string; status: OccurrenceStatusCode | null }
  | { kind: 'tick'; series: SeriesTiming; date: string; entryId: string; checked: boolean }
  | { kind: 'override'; series: SeriesTiming; date: string; start: string; duration: number }
  | { kind: 'clearOverride'; series: SeriesTiming; date: string }
  | { kind: 'cancel'; series: SeriesTiming; date: string }
  | {
      kind: 'addDependency'
      dependent: SeriesTiming
      date: string
      prerequisite: SeriesTiming
      prerequisiteDate: string
      requiredStatus: OccurrenceStatusCode
    }
  | {
      kind: 'removeDependency'
      dependentId: string
      date: string
      prerequisiteId: string
      prerequisiteDate: string
    }

const OCCURRENCES_WRITE_KEY = ['occurrences-write'] as const

/** A write about what happened on a day. */
type DayWrite = Extract<
  OccurrencesWrite,
  { kind: 'status' | 'tick' | 'override' | 'clearOverride' | 'cancel' }
>
/** A write about what a day is WAITING on, rather than what happened on it. */
type WaitWrite = Extract<OccurrencesWrite, { kind: 'addDependency' | 'removeDependency' }>

const isWait = (w: OccurrencesWrite): w is WaitWrite =>
  w.kind === 'addDependency' || w.kind === 'removeDependency'

/** The change a day write makes, without the values naming which day. */
function changeOf(w: DayWrite): OccurrenceChange {
  switch (w.kind) {
    case 'status':
      return { kind: 'status', status: w.status }
    case 'tick':
      return { kind: 'tick', entryId: w.entryId, checked: w.checked }
    case 'override':
      return { kind: 'override', start: w.start, duration: w.duration }
    case 'clearOverride':
      return { kind: 'clearOverride' }
    case 'cancel':
      return { kind: 'cancel' }
  }
}

export function registerOccurrencesDefaults(queryClient: QueryClient, accountId: string): void {
  const months = completionsPrefix(accountId)
  const waits = dependenciesKey(accountId)

  queryClient.setMutationDefaults(OCCURRENCES_WRITE_KEY, {
    scope: { id: accountId },
    mutationFn: (w: OccurrencesWrite) => {
      switch (w.kind) {
        case 'status':
          return setOccurrenceStatus(w.series, w.date, w.status)
        case 'tick':
          return setChecklistEntry(w.series, w.date, w.entryId, w.checked)
        case 'override':
          return setOccurrenceOverride(w.series, w.date, w.start, w.duration)
        case 'clearOverride':
          return clearOccurrenceOverride(w.series, w.date)
        case 'cancel':
          return cancelOccurrence(w.series, w.date)
        case 'addDependency':
          return addDependency(
            w.dependent,
            w.date,
            w.prerequisite,
            w.prerequisiteDate,
            w.requiredStatus,
          )
        case 'removeDependency':
          return removeDependency(w.dependentId, w.date, w.prerequisiteId, w.prerequisiteDate)
      }
    },

    onMutate: async (w: OccurrencesWrite) => {
      if (isWait(w)) {
        await queryClient.cancelQueries({ queryKey: waits })
        const previous = queryClient.getQueryData<Record<string, OccurrenceDependency[]>>(waits)
        if (previous) {
          if (w.kind === 'addDependency') {
            queryClient.setQueryData(
              waits,
              patchAddDependency(previous, occurrenceKey(w.dependent.id, w.date), {
                prerequisiteSeriesId: w.prerequisite.id,
                prerequisiteDate: w.prerequisiteDate,
                requiredStatus: w.requiredStatus,
              }),
            )
          } else {
            queryClient.setQueryData(
              waits,
              patchRemoveDependency(
                previous,
                occurrenceKey(w.dependentId, w.date),
                w.prerequisiteId,
                w.prerequisiteDate,
              ),
            )
          }
        }
        return { waits: previous }
      }

      const change = changeOf(w)

      // Months are fetched with overlapping margins, so one day can sit in more
      // than one cached month. Patch every one of them, or the same day would
      // read differently depending on which month a screen happens to be using.
      await queryClient.cancelQueries({ queryKey: months })
      const previous = queryClient.getQueriesData<CompletionsMap>({ queryKey: months })
      const key = occurrenceKey(w.series.id, w.date)
      queryClient.setQueriesData<CompletionsMap>({ queryKey: months }, (map) =>
        map ? patchCompletions(map, key, change) : map,
      )
      // A write resumed after a restart has nothing to put back and needs
      // nothing: the saved cache already shows the change, and the re-read on
      // settle is what makes it true.
      return { months: previous }
    },
    onError: (_err, _w, ctx) => {
      const restore = ctx as
        | {
            months?: [readonly unknown[], CompletionsMap | undefined][]
            waits?: Record<string, OccurrenceDependency[]>
          }
        | undefined
      for (const [key, data] of restore?.months ?? []) queryClient.setQueryData(key, data)
      if (restore?.waits) queryClient.setQueryData(waits, restore.waits)
    },
    onSettled: (_data, _err, w: OccurrencesWrite) => {
      void queryClient.invalidateQueries({ queryKey: isWait(w) ? waits : months })
    },
  })
}

/**
 * Record something against a day.
 *
 * `mutate({ kind: 'tick', series, date, entryId, checked: true })`
 */
export function useOccurrencesWrite() {
  return useMutation<void, Error, OccurrencesWrite>({ mutationKey: [...OCCURRENCES_WRITE_KEY] })
}
