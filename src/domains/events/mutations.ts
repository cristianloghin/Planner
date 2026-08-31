/**
 * Changing events and blueprints.
 *
 * All of them share one identity and one order, so writes that depend on each
 * other go out in the order they were made, even after a spell offline.
 *
 * Call `registerEventsDefaults` once at start-up, after the account and user
 * are known and before any paused writes are resumed.
 */
import { type QueryClient, useMutation } from '@tanstack/react-query'
import {
  type Recurrence,
  type SeriesTiming,
  deleteSeries,
  saveSeries,
  splitSeries,
} from '../../client/series'
import { patchRemoveEvent, patchRemoveTemplate, patchSaveEvent, patchSaveTemplate } from './patches'
import { eventsKey, templatesKey } from './queries'
import { fromEvent, fromTemplate } from './transformers'
import type { CalendarEvent, EventTemplate } from './types'

/**
 * Every change, as one set of values that can be written down.
 *
 * A new event or blueprint carries its id, minted by the caller before the
 * write, so editing it again before the first write lands still names something
 * real.
 */
export type EventsWrite =
  | { kind: 'saveEvent'; event: CalendarEvent; isNew: boolean; fromTemplateId?: string }
  | { kind: 'removeEvent'; id: string }
  | { kind: 'saveTemplate'; template: EventTemplate; isNew: boolean }
  | { kind: 'removeTemplate'; id: string }
  | {
      kind: 'split'
      /** The repeating event being cut, as it stands before the edit. */
      from: SeriesTiming & { recurrence: Recurrence }
      /** The first day that belongs to the new half. */
      fromDate: string
      /** What the new half should look like. */
      edits: CalendarEvent
    }

const EVENTS_WRITE_KEY = ['events-write'] as const

const isTemplateWrite = (w: EventsWrite) => w.kind === 'saveTemplate' || w.kind === 'removeTemplate'

export function registerEventsDefaults(
  queryClient: QueryClient,
  accountId: string,
  userId: string,
): void {
  const events = eventsKey(accountId)
  const templates = templatesKey(accountId)

  queryClient.setMutationDefaults(EVENTS_WRITE_KEY, {
    scope: { id: accountId },
    mutationFn: (w: EventsWrite) => {
      switch (w.kind) {
        case 'saveEvent':
          return saveSeries(accountId, userId, fromEvent(w.event), {
            isNew: w.isNew,
            templateId: w.fromTemplateId,
          })
        case 'removeEvent':
          return deleteSeries(w.id)
        case 'saveTemplate':
          return saveSeries(accountId, userId, fromTemplate(w.template), { isNew: w.isNew })
        case 'removeTemplate':
          return deleteSeries(w.id)
        case 'split': {
          // Everything attached is dropped on purpose: the server made its own
          // fresh copies during the split, and writing the ones held here would
          // land on the wrong rows.
          const {
            checklist: _c,
            notes: _n,
            reminders: _r,
            isTemplate: _t,
            id: _i,
            ...edits
          } = fromEvent(w.edits)
          return splitSeries(w.from, w.fromDate, edits).then(() => undefined)
        }
      }
    },

    onMutate: async (w: EventsWrite) => {
      // A split makes a second event on the server that cannot be guessed at
      // here, so it shows nothing and waits for the re-read.
      if (w.kind === 'split') return { key: undefined, previous: undefined }

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
        return { key: templates, previous }
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
      return { key: events, previous }
    },
    onError: (_err, _w, ctx) => {
      const restore = ctx as { key?: readonly unknown[]; previous?: unknown } | undefined
      if (restore?.key && restore.previous !== undefined) {
        queryClient.setQueryData(restore.key, restore.previous)
      }
    },
    onSettled: (_data, _err, w: EventsWrite) => {
      // A split changes both halves and moves rows between them, so both the
      // old event and the new one have to be re-read.
      void queryClient.invalidateQueries({
        queryKey: isTemplateWrite(w) ? templates : events,
      })
    },
  })
}

/**
 * Make a change to an event or a blueprint.
 *
 * `mutate({ kind: 'saveEvent', event, isNew: true })`
 */
export function useEventsWrite() {
  return useMutation<void, Error, EventsWrite>({ mutationKey: [...EVENTS_WRITE_KEY] })
}
