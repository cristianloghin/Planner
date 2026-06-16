export type PersonId = 'me' | 'partner'

/** Who an event belongs to: one person, or 'both' (a shared block). */
export type Attendee = PersonId | 'both'

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

/** A calendar event placed on a day of the current week. */
export interface CalendarEvent {
  id: string
  title: string
  /** 0 = Monday ... 6 = Sunday */
  day: number
  /** Minutes from midnight. */
  start: number
  end: number
  /** One person, or 'both' for a shared block spanning both columns. */
  personId: Attendee
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
