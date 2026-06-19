/** A person's id. Now an opaque string (a backend uuid), not a fixed enum — the
 *  app is generic over however many people exist. */
export type PersonId = string

/** Adults hold a full lane and can supervise; children get a narrow lane and
 *  need a free adult on their events. Generalizes the old parent/kid roles. */
export type PersonKind = 'adult' | 'child'

export interface Person {
  id: PersonId
  name: string
  color: string
  kind: PersonKind
  /** Lane order, ascending. */
  sortOrder: number
}

/**
 * A standalone to-do in the Lists view: undated, flat, optionally assigned to one
 * person or shared (personId === null). Distinct from an event's checklist — they
 * share no data, only the spirit of "things to tick off".
 */
export interface ListItem {
  id: string
  title: string
  done: boolean
  personId: PersonId | null
  createdAt: number
}

/** How often an event repeats. Omit on an event for a one-off. */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Repeat every N units (>= 1): every 2 days, every 3 weeks, ... */
  interval: number
}

/**
 * One line of a checklist attachment. Template only — whether it's *checked* is
 * per-occurrence state and lives in `AppState.completions`, never here.
 */
export interface ChecklistEntry {
  id: string
  title: string
}

/**
 * Polymorphic content attached to an event, kept in display order:
 *   - note:      free text (repeatable — an event can have several).
 *   - checklist: a titled list of entries; the event is "done" when all are checked.
 *   - reminder:  an in-app notification offset, in minutes before the event start.
 */
export type Attachment =
  | { id: string; kind: 'note'; text: string }
  | { id: string; kind: 'checklist'; title?: string; items: ChecklistEntry[] }
  | { id: string; kind: 'reminder'; offset: number }

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
  /** Notes, checklists and reminders, in display order. */
  attachments: Attachment[]
  /** Prerequisite event ids — advisory "waiting on…" links (a DAG). */
  dependsOn?: string[]
}

/**
 * Mutable per-occurrence state, keyed `${eventId}:${date}` in `completions`,
 * where `date` is the occurrence's start date. This is where everything you
 * *tick* lives, so a recurring event tracks completion per day.
 */
export interface OccurrenceState {
  /** Manual completion, for events without a checklist. */
  done?: boolean
  /** checklistEntryId → checked. */
  checked?: Record<string, boolean>
}

export interface AppState {
  people: Record<PersonId, Person>
  lists: ListItem[]
  events: CalendarEvent[]
  completions: Record<string, OccurrenceState>
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}
