/**
 * Events and the blueprints they can be made from.
 *
 * Both are one row in the database — a blueprint is a series with no date — and
 * the client returns them as one `Series`. The app treats them as two different
 * things, and this is where that split happens.
 *
 * The other difference from the stored shape is what is attached. The database
 * keeps checklist lines flat, each with a heading; the app wants a checklist as
 * a single thing with its lines inside. See ./transformers.
 */
import type { ColorKey } from '../../assets/palette'
import type { PersonId } from '../people/types'

export type { Recurrence, RecurrenceFreq } from '../../client/series'
import type { Recurrence } from '../../client/series'

/** One line of a checklist. Whether it is ticked is per-day state, kept elsewhere. */
export interface ChecklistEntry {
  id: string
  title: string
}

/**
 * Something attached to an event, in display order:
 *
 * - `checklist` — a titled set of lines; the event is done when all are ticked.
 * - `reminder` — how many minutes before the start to be told.
 */
export type Attachment =
  | { id: string; kind: 'checklist'; title?: string; items: ChecklistEntry[] }
  | { id: string; kind: 'reminder'; offset: number }

/**
 * An event — a pattern, not an entry in a diary.
 *
 * Timing is `start` plus `duration`. Timed: `start` is `yyyy-mm-ddThh:mm` and
 * `duration` is minutes, so a long one runs past midnight. All-day: `start` is
 * `yyyy-mm-dd` and `duration` is whole days. A duration of zero is a moment.
 *
 * Nothing here changes when you tick something off. `recurrence` repeats the
 * whole pattern from `start`, and what happened on any one day of it is kept
 * separately — see domains/occurrences.
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
  attachments: Attachment[]
}

/**
 * A reusable blueprint: an event with everything except a time.
 *
 * "New from template" copies it into a real event with a real start and fresh
 * ids for everything attached, so the two never share rows.
 */
export interface EventTemplate {
  id: string
  title: string
  /** What the created event opens as. */
  allDay: boolean
  /** Minutes, or whole days when `allDay`. */
  duration: number
  attendees: PersonId[]
  attachments: Attachment[]
}
