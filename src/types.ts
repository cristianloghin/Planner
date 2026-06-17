export type PersonId = 'me' | 'partner' | 'kid'

export interface Person {
  id: PersonId
  name: string
  color: string
}

/** A to-do item, optionally assigned to one person or shared (personId === null). */
export interface Task {
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
 * A calendar event anchored to an absolute date.
 *
 * Timing comes in two flavours:
 *   - timed   (allDay === false): a block from `start` to `end` minutes on `date`.
 *   - all-day (allDay === true):  covers whole days; `days` > 1 spans a trip.
 *
 * `recurrence` repeats the whole event from `date` onward; edits/deletes apply
 * to the entire series.
 */
export interface CalendarEvent {
  id: string
  title: string
  /** ISO date (yyyy-mm-dd) of the first occurrence. */
  date: string
  /** All-day (covers whole days) vs a timed block. */
  allDay: boolean
  /** Timed block: minutes from midnight. Ignored when `allDay`. */
  start: number
  end: number
  /** Days an all-day event spans (>= 1). 1 unless it's a multi-day trip. */
  days: number
  /** Repeat rule; omitted for a one-off. */
  recurrence?: Recurrence
  /** Everyone involved — one or more people. A parent + Nora is a joint event. */
  attendees: PersonId[]
  notes?: string
}

export interface AppState {
  people: Record<PersonId, Person>
  tasks: Task[]
  events: CalendarEvent[]
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}
