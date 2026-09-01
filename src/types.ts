import type { CalendarEvent } from './domains/events/types'
import type { TodoList } from './domains/lists/types'
import type { OccurrenceDependency } from './domains/occurrences/types'
import type { Person, PersonId } from './domains/people/types'
import type { Preferences } from './domains/preferences/types'

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
  people: Record<PersonId, Person>
  lists: TodoList[]
  events: CalendarEvent[]
  // Not here: event templates (src/data/templates.ts) and per-occurrence state
  // (src/domains/occurrences) are owned by TanStack Query, not this state tree.
  /**
   * Prerequisite edges keyed by the dependent occurrence (`${eventId}:${date}`),
   * mirroring `occurrence_dependency`. Each value lists the concrete prerequisite
   * occurrences that occurrence waits on.
   */
  dependencies: Record<string, OccurrenceDependency[]>
  /**
   * To-dos surfaced inside a concrete occurrence — `list_item_event_link` rows,
   * keyed by the dependent occurrence (`${seriesId}:${date}`) like `dependencies`.
   * Each value is the linked {@link ListItem} ids; the tick lives on the item's
   * own `done`, so the same to-do may appear under several occurrences.
   */
  listLinks: Record<string, string[]>
  /** This user's personal preferences (colour overrides, …). */
  preferences: Preferences
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}
