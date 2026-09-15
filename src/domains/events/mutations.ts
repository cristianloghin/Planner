/**
 * Changing events and blueprints.
 *
 * All of them share one identity and one order, so writes that depend on each
 * other go out in the order they were made, even after a spell offline.
 *
 * Registering asks nothing of the session — the account and the user ride in
 * each write's values — so `registerEventsDefaults` can run at start-up before
 * anything is read back out of storage.
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
import { deleteSeries, saveSeries } from '../../client/series'
import type { SeriesTiming } from '../../client/series'
import type { PersonId } from '../people/types'
import {
  type OccurrenceChange,
  patchOccurrences,
  patchRemoveEvent,
  patchRemoveTemplate,
  patchSaveEvent,
  patchSaveTemplate,
} from './patches'
import { eventsKey, occurrencesPrefix, templatesKey } from './queries'
import { fromEvent, fromTemplate, occurrenceKey } from './transformers'
import type { CalendarEvent, EventTemplate, OccurrenceMap } from './types'

/**
 * Every change, as one set of values that can be written down.
 *
 * A new event or blueprint carries its id, minted by the caller before the
 * write, so editing it again before the first write lands still names something
 * real.
 */
export type EventsChange =
  | { kind: 'saveEvent'; event: CalendarEvent; isNew: boolean }
  | { kind: 'removeEvent'; id: string }
  | { kind: 'saveTemplate'; template: EventTemplate; isNew: boolean }
  | { kind: 'removeTemplate'; id: string }

/** What `mutate()` takes: the change, plus the account and user it belongs to. */
export type EventsWrite = {
  accountId: string
  userId: string
  change: EventsChange
}

const EVENTS_WRITE_KEY = ['events-write'] as const

/**
 * Every change to one day of an event, as one set of values that can be
 * written down. Each carries the event's timing rather than the whole event,
 * because that is all a write needs to find the right day — and because a set
 * of values that has to survive a restart should be as small as it can be.
 */
export type OccurrencesChange =
  | { kind: 'override'; series: SeriesTiming; date: string; start: string; duration: number }
  | { kind: 'clearOverride'; series: SeriesTiming; date: string }
  | { kind: 'attendees'; series: SeriesTiming; date: string; attendees: PersonId[] }
  | { kind: 'clearAttendees'; series: SeriesTiming; date: string }
  | { kind: 'cancel'; series: SeriesTiming; date: string }

/** What a day write's `mutate()` takes: the change, and the account it belongs to. */
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

const isTemplateWrite = (w: EventsChange) =>
  w.kind === 'saveTemplate' || w.kind === 'removeTemplate'

export function registerEventsDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(EVENTS_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: async ({ accountId, userId, change: w }: EventsWrite) => {
      switch (w.kind) {
        case 'saveEvent':
          return saveSeries(accountId, userId, fromEvent(w.event), { isNew: w.isNew })
        case 'removeEvent':
          return deleteSeries(w.id)
        case 'saveTemplate':
          return saveSeries(accountId, userId, fromTemplate(w.template), {
            isNew: w.isNew,
          })
        case 'removeTemplate':
          return deleteSeries(w.id)
      }
    },

    onMutate: async ({ accountId, change: w }: EventsWrite): Promise<Rollback> => {
      const events = eventsKey(accountId)
      const templates = templatesKey(accountId)
      const key = isTemplateWrite(w) ? templates : events
      await queryClient.cancelQueries({ queryKey: key })

      if (w.kind === 'saveTemplate' || w.kind === 'removeTemplate') {
        const previous = queryClient.getQueryData<EventTemplate[]>(templates)
        if (previous) {
          queryClient.setQueryData<EventTemplate[]>(
            templates,
            w.kind === 'saveTemplate'
              ? patchSaveTemplate(previous, w.template)
              : patchRemoveTemplate(previous, w.id),
          )
        }
        return { entries: previous ? [[templates, previous]] : [] }
      }

      const previous = queryClient.getQueryData<CalendarEvent[]>(events)
      if (previous) {
        queryClient.setQueryData<CalendarEvent[]>(
          events,
          w.kind === 'saveEvent'
            ? patchSaveEvent(previous, w.event)
            : patchRemoveEvent(previous, w.id),
        )
      }
      return { entries: previous ? [[events, previous]] : [] }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId, change: w }: EventsWrite) => {
      const events = eventsKey(accountId)
      const templates = templatesKey(accountId)
      // The optimistic patch is a guess; the server's row is the truth, so
      // re-read it either way.
      void queryClient.invalidateQueries({
        queryKey: isTemplateWrite(w) ? templates : events,
      })
    },
  })

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
      const months = occurrencesPrefix(accountId)
      const change = changeOf(w)

      // Months are fetched with overlapping margins, so one day can sit in more
      // than one cached month. Patch every one of them, or the same day would
      // read differently depending on which month a screen happens to be using.
      await queryClient.cancelQueries({ queryKey: months })
      const previous = queryClient.getQueriesData<OccurrenceMap>({ queryKey: months })
      const key = occurrenceKey(w.series.id, w.date)
      queryClient.setQueriesData<OccurrenceMap>({ queryKey: months }, (map) =>
        map ? patchOccurrences(map, key, change) : map,
      )
      return { entries: previous }
    },
    onError: (_err, _vars, ctx) => rollback(queryClient, ctx),
    onSettled: (_data, _err, { accountId }: OccurrencesWrite) => {
      void queryClient.invalidateQueries({ queryKey: occurrencesPrefix(accountId) })
    },
  })
}

/**
 * Make a change to an event or a blueprint.
 *
 * `mutate({ accountId, userId, change: { kind: 'saveEvent', event, isNew: true } })`
 */
export function useEventsWrite() {
  return useMutation<void, Error, EventsWrite>({
    mutationKey: [...EVENTS_WRITE_KEY],
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
