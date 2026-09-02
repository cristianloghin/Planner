/**
 * The one place every domain's write behaviour is registered.
 *
 * Call `registerDomainDefaults` at start-up, before anything is read back out
 * of storage. A write paused offline is saved with only its key and its
 * values; on restart the runtime looks the key up here to find out how to run
 * it, and a domain that never registered would have its write dropped without
 * a word. Registering asks nothing of the session, so this can — and should —
 * run before React does.
 *
 * A new domain with writes gets a line here.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { accountKey } from './account/queries'
import { registerEventsDefaults } from './events/mutations'
import { eventsKey, templatesKey } from './events/queries'
import { registerListsDefaults } from './lists/mutations'
import { listLinksKey, listsKey } from './lists/queries'
import { registerOccurrencesDefaults } from './occurrences/mutations'
import { completionsPrefix, dependenciesKey } from './occurrences/queries'
import { registerPeopleDefaults } from './people/mutations'
import { peopleKey } from './people/queries'
import { registerPreferencesDefaults } from './preferences/mutations'
import { preferencesKey } from './preferences/queries'

export function registerDomainDefaults(queryClient: QueryClient): void {
  registerEventsDefaults(queryClient)
  registerListsDefaults(queryClient)
  registerOccurrencesDefaults(queryClient)
  registerPeopleDefaults(queryClient)
  registerPreferencesDefaults(queryClient)
}

/** Who the signed-in person is, as the query keys need it. */
export interface RealtimeIds {
  accountId: string | null
  userId: string | null
}

/**
 * Which cached reads a change to one database table makes stale.
 *
 * This is the other half of the realtime wiring: the client says which table
 * changed, and this says what to re-read because of it. It is the one place
 * that knows every domain's keys, which is why it sits here rather than in a
 * domain. A table that no domain reads gets an empty list.
 *
 * Invalidating a key nothing is subscribed to does nothing, so this can name
 * every domain today and each entry starts mattering as its domain is adopted.
 */
export function queryKeysForTable(table: string, { accountId, userId }: RealtimeIds): QueryKey[] {
  switch (table) {
    // Events and blueprints are one table, told apart by whether they have a
    // date. Their attendees, checklist lines, notes and reminders are read
    // alongside them, so a change to any of those is a change to the event.
    case 'event_series':
    case 'event_person':
    case 'checklist_item':
    case 'note':
    case 'reminder':
      return [eventsKey(accountId), templatesKey(accountId)]
    // What happened on a day: status and ticks.
    case 'event_occurrence':
    case 'occurrence_item_state':
      return [completionsPrefix(accountId)]
    case 'occurrence_dependency':
      return [dependenciesKey(accountId)]
    case 'person':
      return [peopleKey(accountId)]
    case 'user_preference':
      return [preferencesKey(accountId, userId)]
    // Links are read with the lists, so a link change is a list change.
    case 'list':
    case 'list_item':
    case 'list_item_event_link':
      return [listsKey(accountId), listLinksKey(accountId)]
    case 'account_member':
      return [accountKey(userId)]
    default:
      // push_subscription, and anything added later: nothing cached reads it.
      return []
  }
}
