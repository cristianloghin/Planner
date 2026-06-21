import type { EventColorKey, UserColorKey } from './lib/palette'

/** A person's id. Now an opaque string (a backend uuid), not a fixed enum — the
 *  app is generic over however many people exist. */
export type PersonId = string

/** Adults hold a full lane and can supervise; children get a narrow lane and
 *  need a free adult on their events. Generalizes the old parent/kid roles. */
export type PersonKind = 'adult' | 'child'

export interface Person {
  id: PersonId
  name: string
  /** The account-wide default user-color *key* (one of the nine in the palette).
   *  A per-user override may sit on top in {@link Preferences.personColors}. */
  color: string
  kind: PersonKind
  /** Lane order, ascending. */
  sortOrder: number
}

/**
 * A standalone to-do, living inside a {@link TodoList}. Undated by default,
 * optionally assigned to one person or shared (personId === null). Distinct from
 * an event's checklist — they share no data, only the spirit of "things to tick
 * off". `done` lives on the item itself (single context — it stays checked in
 * place and can be unchecked); see DATA_MODEL Decision 11. A to-do can also be
 * surfaced inside a calendar occurrence via `AppState.listLinks` — the tick stays
 * on this one `done`, so ticking it there or here is the same write.
 */
export interface ListItem {
  id: string
  title: string
  done: boolean
  personId: PersonId | null
  /** In-list section header; null = ungrouped (grouped/sorted like a checklist). */
  groupLabel: string | null
  /** Optional deadline as an ISO date ('yyyy-mm-dd'); null = none. */
  dueOn: string | null
  /** Position within the list, ascending (checklist-parity ordering). */
  sortOrder: number
  createdAt: number
}

/**
 * A named, account-scoped list of to-dos (DB table `list`). The Lists view shows
 * one list at a time; users can create, rename, and delete lists.
 */
export interface TodoList {
  id: string
  title: string
  /** List order, ascending. */
  sortOrder: number
  items: ListItem[]
}

/** How often an event repeats. Omit on an event for a one-off. */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Repeat every N units (>= 1): every 2 days, every 3 weeks, ... */
  interval: number
  /**
   * Inclusive last day the series may produce an occurrence, as a local ISO date
   * (`yyyy-mm-dd`). Omitted = repeats forever. Set when a series is capped by a
   * "this and following" split; round-trips through the stored RRULE's `UNTIL`.
   */
  until?: string
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
  /**
   * Optional event color, a key into the fixed event palette
   * (`src/lib/palette.ts`). Absent = no event color chosen, so the timeline
   * falls back to the attendee color.
   */
  colorKey?: EventColorKey
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

/**
 * An occurrence's status, matching the DB `occurrence_status` lookup. `done` can
 * also be derived from a checklist (see `isOccurrenceDone`); `skipped`/`blocked`
 * are only ever set explicitly.
 */
export type OccurrenceStatusCode = 'done' | 'skipped' | 'blocked'

/**
 * One prerequisite edge for an occurrence — a row of `occurrence_dependency`.
 * Stored in `AppState.dependencies` keyed by the *dependent* occurrence, so it
 * names only the prerequisite end: a concrete occurrence of another series and
 * the status that occurrence must reach to clear the gate.
 */
export interface OccurrenceDependency {
  prerequisiteSeriesId: string
  /** ISO date (yyyy-mm-dd) of the specific prerequisite occurrence. */
  prerequisiteDate: string
  requiredStatus: OccurrenceStatusCode
}

/**
 * Mutable per-occurrence state, keyed `${eventId}:${date}` in `completions`,
 * where `date` is the occurrence's start date. This is where everything you
 * *tick* lives, so a recurring event tracks completion per day.
 */
export interface OccurrenceState {
  /**
   * Explicit occurrence status (`event_occurrence.status`). For a checklist-free
   * event this is how "done" is set manually; it also carries `skipped`/`blocked`.
   * Absent = compute (e.g. derive `done` from the checklist).
   */
  status?: OccurrenceStatusCode
  /** checklistEntryId → checked. */
  checked?: Record<string, boolean>
  /**
   * One-off timing override for *this* occurrence only (`event_occurrence`'s
   * `rescheduled_to` / `rescheduled_duration`). Same units as {@link CalendarEvent}:
   * `start` is `yyyy-mm-ddThh:mm` (timed) or `yyyy-mm-dd` (all-day) on the
   * occurrence's own date — the day is fixed, only the time of day and length
   * move; `duration` is minutes (timed) or whole days (all-day). Absent fields
   * fall back to the series timing.
   */
  start?: string
  duration?: number
  /** This occurrence has been removed from the series (`event_occurrence.cancelled`). */
  cancelled?: boolean
}

/**
 * Per-user, per-account settings — personal, never shared with a partner. Stored
 * as one JSON document (the `user_preference` table) so new settings are just new
 * fields here, no schema change. The first one is `personColors`: an override for
 * how THIS user sees each person's lane; an unset id falls back to the shared
 * `Person.color`.
 */
export interface Preferences {
  /** Per-person user-color override, as a palette key (one of the nine). */
  personColors: Record<PersonId, UserColorKey>
}

export interface AppState {
  people: Record<PersonId, Person>
  lists: TodoList[]
  events: CalendarEvent[]
  /** Reusable event blueprints (DATA_MODEL Decision 10); never on the calendar. */
  templates: EventTemplate[]
  completions: Record<string, OccurrenceState>
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
