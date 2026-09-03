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
export type {
  CompletionsMap,
  OccurrenceDependency,
  OccurrenceState,
  OccurrenceStatusCode,
} from './domains/occurrences/types'
export type { Person, PersonId, PersonKind } from './domains/people/types'
export type { Preferences, WeekLayout } from './domains/preferences/types'
