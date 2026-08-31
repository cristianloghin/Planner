import * as service from '../services/recurrence/status'
/**
 * @deprecated Moved to services/recurrence.
 *
 * Two of these changed shape on the way: the service is *fed* the dependency
 * edges and the events it needs, rather than being handed the whole state tree
 * and looking them up itself — a service that reaches into app state is not
 * self-contained, and the state tree is dissolving anyway.
 *
 * This unpacks the state tree for the screens still passing it, so nothing had
 * to change at the call sites. Delete it once they call the service directly.
 */
import type { AppState, CalendarEvent, CompletionsMap } from '../types'

export type { EventStatus, UnmetPrerequisite } from '../services/recurrence/status'
export {
  isOccurrenceDone,
  occKey,
  occurrenceEffectiveStatus,
  prerequisiteDatesInRange,
} from '../services/recurrence/status'

export function blockingPrerequisites(
  state: AppState,
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): service.UnmetPrerequisite[] {
  return service.blockingPrerequisites(state.dependencies, state.events, completions, event, date)
}

export function occurrenceStatus(
  state: AppState,
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): service.EventStatus {
  return service.occurrenceStatus(state.dependencies, state.events, completions, event, date)
}
