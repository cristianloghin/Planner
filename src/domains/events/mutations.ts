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
import { deleteSeries, saveSeries } from '../../client/series'
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
export type EventsChange =
  | {
      kind: 'saveEvent'
      event: CalendarEvent
      isNew: boolean
      fromTemplateId?: string
    }
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

const isTemplateWrite = (w: EventsChange) =>
  w.kind === 'saveTemplate' || w.kind === 'removeTemplate'

export function registerEventsDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(EVENTS_WRITE_KEY, {
    scope: { id: APP_SCOPE },
    mutationFn: async ({ accountId, userId, change: w }: EventsWrite) => {
      switch (w.kind) {
        case 'saveEvent':
          return saveSeries(accountId, userId, fromEvent(w.event), {
            isNew: w.isNew,
            templateId: w.fromTemplateId,
          })
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
