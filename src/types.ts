import type { CalendarEvent } from './domains/events/types'
import type { OccurrenceDependency } from './domains/occurrences/types'

// Every type the app uses is declared by the domain that owns it, and
// re-exported here so consumers keep one import site while the restructure
// runs. A domain that does not reshape what the client returns passes the
// client's declaration along unchanged — each domain's types.ts says which of
// the two it is doing, and why.

export type {
  Attachment,
  CalendarEvent,
  ChecklistEntry,
  EventTemplate,
  Recurrence,
  RecurrenceFreq,
} from './domains/events/types'
export type { ListItem, TodoList } from './domains/lists/types'
export type {
  CompletionsMap,
  OccurrenceDependency,
  OccurrenceState,
  OccurrenceStatusCode,
} from './domains/occurrences/types'
export type { Person, PersonId, PersonKind } from './domains/people/types'
export type { Preferences, WeekLayout } from './domains/preferences/types'

export interface AppState {
  events: CalendarEvent[]
  // Not here: people, preferences and lists (src/domains/people, /preferences,
  // /lists), event templates (src/domains/events) and per-occurrence state
  // (src/domains/occurrences) are owned by TanStack Query, not this state tree.
  /**
   * Prerequisite edges keyed by the dependent occurrence (`${eventId}:${date}`),
   * mirroring `occurrence_dependency`. Each value lists the concrete prerequisite
   * occurrences that occurrence waits on.
   */
  dependencies: Record<string, OccurrenceDependency[]>
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}
