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
import type { QueryClient } from '@tanstack/react-query'
import { registerEventsDefaults } from './events/mutations'
import { registerListsDefaults } from './lists/mutations'
import { registerOccurrencesDefaults } from './occurrences/mutations'
import { registerPeopleDefaults } from './people/mutations'
import { registerPreferencesDefaults } from './preferences/mutations'

export function registerDomainDefaults(queryClient: QueryClient): void {
  registerEventsDefaults(queryClient)
  registerListsDefaults(queryClient)
  registerOccurrencesDefaults(queryClient)
  registerPeopleDefaults(queryClient)
  registerPreferencesDefaults(queryClient)
}
