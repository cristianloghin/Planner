/**
 * Recording what happened on one day.
 *
 * Registering asks nothing of the session — the account rides in each write's
 * values — so `registerOccurrencesDefaults` can run at start-up before anything
 * is read back out of storage.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import { APP_SCOPE } from '../../assets/constants'
import { type Rollback, rollback } from '../../assets/rollback'
import {
  cancelOccurrence,
  clearOccurrenceAttendees,
  clearOccurrenceOverride,
  setOccurrenceAttendees,
  setOccurrenceOverride,
} from '../../client/occurrences'
import type { SeriesTiming } from '../../client/series'
import type { PersonId } from '../people/types'
import { type OccurrenceChange, patchCompletions } from './patches'
import { completionsPrefix } from './queries'
import { occurrenceKey } from './transformers'
import type { CompletionsMap } from './types'

/**
 * Every change, as one set of values that can be written down.
 *
 * Each carries the event's timing rather than the whole event, because that is
 * all a write needs to find the right day — and because a set of values that
 * has to survive a restart should be as small as it can be.
 */
export type OccurrencesChange =
  | { kind: 'override'; series: SeriesTiming; date: string; start: string; duration: number }
  | { kind: 'clearOverride'; series: SeriesTiming; date: string }
  | { kind: 'attendees'; series: SeriesTiming; date: string; attendees: PersonId[] }
  | { kind: 'clearAttendees'; series: SeriesTiming; date: string }
  | { kind: 'cancel'; series: SeriesTiming; date: string }

/** What `mutate()` takes: the change, and the account it belongs to. */
export type OccurrencesWrite = { accountId: string; change: OccurrencesChange }

const OCCURRENCES_WRITE_KEY = ['occurrences-write'] as const

/** The change a day write makes, without the values naming which day. */
function changeOf(w: OccurrencesChange): OccurrenceChange {
  switch (w.kind) {
    case 'override':
      return { kind: 'override', start: w.start, duration: w.duration }
    case 'clearOverride':
      return { kind: 'clearOverride' }
    case 'attendees':
      return { kind: 'attendees', attendees: w.attendees }
    case 'clearAttendees':
      return { kind: 'clearAttendees' }
    case 'cancel':
      return { kind: 'cancel' }
  }
}

export function registerOccurrencesDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(OCCURRENCES_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: ({ change: w }: OccurrencesWrite) => {
      switch (w.kind) {
        case 'override':
          return setOccurrenceOverride(w.series, w.date, w.start, w.duration)
        case 'clearOverride':
          return clearOccurrenceOverride(w.series, w.date)
        case 'attendees':
          return setOccurrenceAttendees(w.series, w.date, w.attendees)
        case 'clearAttendees':
          return clearOccurrenceAttendees(w.series, w.date)
        case 'cancel':
          return cancelOccurrence(w.series, w.date)
      }
    },

    onMutate: async ({ accountId, change: w }: OccurrencesWrite): Promise<Rollback> => {
      const months = completionsPrefix(accountId)
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
      return { entries: previous }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId }: OccurrencesWrite) => {
      void queryClient.invalidateQueries({ queryKey: completionsPrefix(accountId) })
    },
  })
}

/**
 * Record something against a day.
 *
 * `mutate({ accountId, change: { kind: 'cancel', series, date } })`
 */
export function useOccurrencesWrite() {
  return useMutation<void, Error, OccurrencesWrite>({ mutationKey: [...OCCURRENCES_WRITE_KEY] })
}
