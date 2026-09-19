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
import { deleteSeries, saveSeries, setSeriesRecurrence, splitSeries } from '../../client/series'
import type { Recurrence, SeriesTiming } from '../../client/series'
import type { PersonId } from '../people/types'
import {
  type OccurrenceChange,
  patchEventRecurrence,
  patchMoveOccurrences,
  patchOccurrences,
  patchRemoveEvent,
  patchRemoveTemplate,
  patchSaveEvent,
  patchSaveTemplate,
  patchSplitEvent,
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
 *
 * The two writes that act on a series from one of its days on are a cap and a
 * split. `endEvent` leaves the series repeating by a rule that ends before
 * that day — "delete this and following". `splitEvent` does the same to the
 * series and adds a new one that takes over from that day, carrying the days
 * already recorded from there on with it — "edit this and following".
 */
export type EventsChange =
  | { kind: 'saveEvent'; event: CalendarEvent; isNew: boolean }
  | { kind: 'removeEvent'; id: string }
  | { kind: 'endEvent'; id: string; recurrence: Recurrence }
  | {
      kind: 'splitEvent'
      /** The series being cut, and the rule it is left with. */
      id: string
      recurrence: Recurrence
      /** The first day that belongs to the new half. */
      fromDate: string
      /** The new half, with an id of its own. */
      event: CalendarEvent
      /**
       * The id the new half's copy of the series' note gets, so the note
       * write that follows this one can name it. Minted whether or not the
       * series has a note; unused when it has none.
       */
      noteId: string
    }
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

/** The events the moment a change is made, before the server has confirmed it. */
function patchEvents(events: CalendarEvent[], w: EventsChange): CalendarEvent[] {
  switch (w.kind) {
    case 'saveEvent':
      return patchSaveEvent(events, w.event)
    case 'removeEvent':
      return patchRemoveEvent(events, w.id)
    case 'endEvent':
      return patchEventRecurrence(events, w.id, w.recurrence)
    case 'splitEvent':
      return patchSplitEvent(events, w.id, w.recurrence, w.event)
    case 'saveTemplate':
    case 'removeTemplate':
      return events
  }
}

export function registerEventsDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(EVENTS_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: async ({ accountId, userId, change: w }: EventsWrite) => {
      switch (w.kind) {
        case 'saveEvent':
          return saveSeries(accountId, userId, fromEvent(w.event), { isNew: w.isNew })
        case 'removeEvent':
          return deleteSeries(w.id)
        case 'endEvent':
          return setSeriesRecurrence(w.id, w.recurrence)
        case 'splitEvent':
          // One transaction on the server: the copy, the hand-over of the
          // days from the cut on, and the cap land together or not at all.
          return splitSeries(w.id, w.recurrence, w.fromDate, fromEvent(w.event), userId, w.noteId)
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
      if (previous) queryClient.setQueryData<CalendarEvent[]>(events, patchEvents(previous, w))
      const entries: Rollback['entries'] = previous ? [[events, previous]] : []

      if (w.kind === 'splitEvent') {
        // The days handed to the new half sit in the occurrence windows, and
        // one day can sit in several cached months — re-file it in every one,
        // or the same day would read differently depending on the screen.
        const months = occurrencesPrefix(accountId)
        await queryClient.cancelQueries({ queryKey: months })
        entries.push(...queryClient.getQueriesData<OccurrenceMap>({ queryKey: months }))
        queryClient.setQueriesData<OccurrenceMap>({ queryKey: months }, (map) =>
          map ? patchMoveOccurrences(map, w.id, w.fromDate, w.event.id) : map,
        )
      }
      return { entries }
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
      // A split moved days between series too, and those are read per window.
      if (w.kind === 'splitEvent') {
        void queryClient.invalidateQueries({ queryKey: occurrencesPrefix(accountId) })
      }
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
