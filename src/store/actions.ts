import type { CalendarEvent, PersonId } from '../types'

/**
 * Every state change flows through one of these. The reducer applies it to
 * in-memory state; the store persists it (see `ScheduleStore.apply`). Shared
 * here so both sides agree without a circular import through `state.tsx`.
 */
export type Action =
  | { type: 'addListItem'; title: string; personId: PersonId | null }
  | { type: 'toggleListItem'; id: string }
  | { type: 'removeListItem'; id: string }
  | { type: 'addEvent'; event: Omit<CalendarEvent, 'id'> }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  | { type: 'setOccurrenceDone'; eventId: string; date: string; done: boolean }
  | { type: 'toggleChecklistEntry'; eventId: string; date: string; entryId: string }
  | { type: 'renamePerson'; id: PersonId; name: string }
  | { type: 'recolorPerson'; id: PersonId; color: string }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }
  | { type: 'hydrate'; state: import('../types').AppState }
