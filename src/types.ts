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
  /** In-app reminder offsets, in minutes before the event start (e.g. 15, 1440). */
  reminders?: number[]
  notes?: string
}

/**
 * A standalone in-app notification at a date + time, optionally repeating daily.
 * (Not tied to an event — e.g. "notify at 18:30".)
 */
export interface Reminder {
  id: string
  title: string
  /** ISO date it's anchored to (the only day when repeat is 'none'). */
  date: string
  /** Minutes from midnight it fires at. */
  time: number
  repeat: 'none' | 'daily'
}

export interface AppState {
  people: Record<PersonId, Person>
  tasks: Task[]
  events: CalendarEvent[]
  reminders: Reminder[]
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}
