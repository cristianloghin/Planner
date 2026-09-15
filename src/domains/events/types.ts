/**
 * Events and the blueprints they can be made from.
 *
 * Both are one row in the database — a blueprint is a series with no date — and
 * the client returns them as one `Series`. The app treats them as two different
 * things, and this is where that split happens.
 *
 * Reminders are carried straight through from the stored shape — the same
 * `{ id, offset }` the client returns — so nothing converts. See ./transformers.
 */
import type { ColorKey } from '../../assets/palette'
import type { PersonId } from '../people/types'

export type { Recurrence, RecurrenceFreq } from '../../client/series'
import type { Recurrence } from '../../client/series'

/** How many minutes before the start to be told. Same shape as the stored row. */
export interface EventReminder {
  id: string
  offset: number
}

/**
 * An event — a pattern, not an entry in a diary.
 *
 * Timing is `start` plus `duration`. Timed: `start` is `yyyy-mm-ddThh:mm` and
 * `duration` is minutes, so a long one runs past midnight. All-day: `start` is
 * `yyyy-mm-dd` and `duration` is whole days. A duration of zero is a moment.
 *
 * Nothing here changes when you tick something off. `recurrence` repeats the
 * whole pattern from `start`, and what happened on any one day of it is kept
 * separately — see `OccurrenceState` below.
 */
export interface CalendarEvent {
  id: string
  title: string
  start: string
  allDay: boolean
  duration: number
  /** Absent for a one-off. */
  recurrence?: Recurrence
  /** Everyone involved — at least one person. */
  attendees: PersonId[]
  /** Absent means it takes the colour of the person whose lane it sits in. */
  colorKey?: ColorKey
  reminders: EventReminder[]
}

/**
 * A reusable blueprint: an event with everything except a time and people.
 *
 * Who is on the event is decided when it is made — adding one starts from a
 * person's lane — so a template carries no people. It does carry a colour,
 * which the created event takes as its own.
 *
 * "New from template" copies it into a real event with a real start and fresh
 * reminder ids, so the two never share rows.
 */
export interface EventTemplate {
  id: string
  title: string
  /** What the created event opens as. */
  allDay: boolean
  /** Minutes, or whole days when `allDay`. */
  duration: number
  /** Always set: a template names its colour rather than borrowing a lane's. */
  colorKey: ColorKey
  reminders: EventReminder[]
}

/**
 * What happened on one day of a repeating event.
 *
 * An event is a pattern; this is everything that makes one day of it differ —
 * moved, taken out, or with different people on it. The database keeps that
 * as sparse rows. The app wants one thing per day, looked up by day.
 *
 * Everything is optional and an absent field means "nothing recorded" — days
 * that match their series have no entry at all.
 */
export interface OccurrenceState {
  /**
   * Moved to, for this day only, in the event's own units. The day itself does
   * not change — only the time within it, and how long it runs.
   */
  start?: string
  duration?: number
  /** Taken out of the series. The pattern still produces it; it is not drawn. */
  cancelled?: boolean
  /**
   * Exactly these people on this day. Absent means "as the series" — so a day
   * that has never been overridden reads through to the series' own list.
   */
  attendees?: PersonId[]
}

/**
 * Every day with something recorded, keyed by event and day. The key format
 * is this domain's own — read it through an `OccurrenceIndex`, never by
 * building keys.
 */
export type OccurrenceMap = Record<string, OccurrenceState>

/**
 * A window of recorded days, looked up by event and date. This is what the
 * domain hands to screens and to the recurrence engine: a service may not
 * import a domain's key builder, so it is given lookups instead of a map.
 */
export interface OccurrenceIndex {
  /** One day's state, if anything is recorded on it. */
  on(eventId: string, date: string): OccurrenceState | undefined
  /** Every recorded day of one event, as `[date, state]` pairs. */
  of(eventId: string): [string, OccurrenceState][]
}
