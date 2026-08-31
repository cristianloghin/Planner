import type { TodoList } from './client/lists'
import type { OccurrenceDependency } from './client/occurrences'
import type { Person, PersonId } from './client/people'
import type { Preferences } from './client/preferences'
import type { Attachment, Recurrence } from './client/series'
import type { ColorKey } from './lib/palette'

// Occurrence state is declared by the client layer, which is where the two
// backing tables are converted into it (src/client/occurrences.ts). Re-exported
// here so existing consumers keep one import site while the migration runs.
export type {
  CompletionsMap,
  OccurrenceDependency,
  OccurrenceState,
  OccurrenceStatusCode,
} from './client/occurrences'

// Per-user settings are likewise declared by the client layer, which validates
// the stored JSON document into this shape (src/client/preferences.ts).
export type { Preferences, WeekLayout } from './client/preferences'

// People are declared by the client layer too (src/client/people.ts).
export type { Person, PersonId, PersonKind } from './client/people'

// Lists and their to-dos, likewise (src/client/lists.ts).
export type { ListItem, TodoList } from './client/lists'

// A series and the pieces it is built from are declared by the client layer
// (src/client/series.ts) — one table, one module. CalendarEvent and
// EventTemplate below are the app's own split of that one shape.
export type { Attachment, ChecklistEntry, Recurrence, RecurrenceFreq } from './client/series'

/**
 * A calendar event — a pure *template*. Timing is `start` + `duration`:
 *   - timed   (allDay === false): `start` is an ISO datetime `yyyy-mm-ddThh:mm`,
 *     `duration` is minutes. A large duration spans midnight / several days.
 *   - all-day (allDay === true):  `start` is an ISO date `yyyy-mm-dd`, `duration`
 *     is whole days (>= 1).
 * `duration === 0` is a point in time.
 *
 * No mutable "tick" state lives here — completion is per-occurrence (see
 * `AppState.completions`). `recurrence` repeats the whole template from `start`.
 */
export interface CalendarEvent {
  id: string
  title: string
  start: string
  allDay: boolean
  duration: number
  recurrence?: Recurrence
  /** Everyone involved — one or more people. */
  attendees: PersonId[]
  /**
   * Optional event color, a key into the unified palette (`src/lib/palette.ts`).
   * Absent = inherit the (lane) person's color.
   */
  colorKey?: ColorKey
  /** Notes, checklists and reminders, in display order. */
  attachments: Attachment[]
}

/**
 * A reusable event *blueprint* — an `event_series` row with `is_template = true`
 * and no `dtstart`/`rrule` (see DATA_MODEL Decision 10). It owns the same roster
 * and attachments (notes / checklists / reminders) as a real series, but carries
 * no point in time. "New from template" is an app-side **deep copy** into a
 * concrete {@link CalendarEvent} with a real `start` (and fresh attachment ids),
 * recording the source via the DB's `template_id` provenance column.
 */
export interface EventTemplate {
  id: string
  title: string
  /** Default all-day flag the created event opens with. */
  allDay: boolean
  /** Default duration (minutes timed / whole days all-day) for the created event. */
  duration: number
  attendees: PersonId[]
  /** Notes, checklists and reminders copied onto each event made from this. */
  attachments: Attachment[]
}

export interface AppState {
  people: Record<PersonId, Person>
  lists: TodoList[]
  events: CalendarEvent[]
  // Not here: event templates (src/data/templates.ts) and per-occurrence state
  // (src/data/completions.ts) are owned by TanStack Query, not this state tree.
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
