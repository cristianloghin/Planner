/** A member id is just a string (UUID once on Supabase). */
export type MemberId = string

/**
 * Sync bookkeeping carried by every persisted entity, mirroring the columns a
 * Supabase table will have. `deletedAt` is a soft delete — rows stay around so
 * the change can sync; the UI filters them out (see lib/sync `active`).
 */
export interface SyncMeta {
  id: string
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** The shared family/group everything belongs to. */
export interface Household extends SyncMeta {
  name: string
}

export type MemberRole = 'adult' | 'child'

/** A person in the household. Role drives the child-coverage logic. */
export interface Member extends SyncMeta {
  householdId: string
  name: string
  color: string
  role: MemberRole
}

/** A to-do item, optionally assigned to one member (memberId === null = shared). */
export interface Task extends SyncMeta {
  householdId: string
  title: string
  done: boolean
  memberId: MemberId | null
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
export interface CalendarEvent extends SyncMeta {
  householdId: string
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
  /** Member ids involved — one or more. An adult + child is a joint event. */
  attendees: MemberId[]
  /** In-app reminder offsets, in minutes before the event start (e.g. 15, 1440). */
  reminders?: number[]
  notes?: string
}

/**
 * A standalone in-app notification at a date + time, optionally repeating daily.
 * (Not tied to an event — e.g. "notify at 18:30".)
 */
export interface Reminder extends SyncMeta {
  householdId: string
  title: string
  /** ISO date it's anchored to (the only day when repeat is 'none'). */
  date: string
  /** Minutes from midnight it fires at. */
  time: number
  repeat: 'none' | 'daily'
}

export interface AppState {
  household: Household
  members: Member[]
  tasks: Task[]
  events: CalendarEvent[]
  reminders: Reminder[]
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. Local-only UI. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. Local-only UI. */
  selectedDay: number
}
