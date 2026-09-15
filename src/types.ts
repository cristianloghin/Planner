// Every type the app uses is declared by the domain that owns it, and
// re-exported here so consumers keep one import site while the restructure
// runs. A domain that does not reshape what the client returns passes the
// client's declaration along unchanged — each domain's types.ts says which of
// the two it is doing, and why.

export type {
  CalendarEvent,
  EventReminder,
  EventTemplate,
  Recurrence,
  RecurrenceFreq,
  OccurrenceIndex,
  OccurrenceMap,
  OccurrenceState,
} from './domains/events/types'
export type { Person, PersonId, Preferences } from './domains/people/types'
