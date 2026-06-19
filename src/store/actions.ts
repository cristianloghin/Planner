import type { CalendarEvent, OccurrenceStatusCode, PersonId } from '../types'

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
  // Set (or clear, with status: null) an occurrence's explicit status.
  | { type: 'setOccurrenceStatus'; eventId: string; date: string; status: OccurrenceStatusCode | null }
  | { type: 'toggleChecklistEntry'; eventId: string; date: string; entryId: string }
  // Occurrence→occurrence prerequisite edges (occurrence_dependency). The
  // dependent end is (eventId, date); the prerequisite end is a concrete slot.
  | {
      type: 'addDependency'
      eventId: string
      date: string
      prerequisiteSeriesId: string
      prerequisiteDate: string
      requiredStatus: OccurrenceStatusCode
    }
  | {
      type: 'removeDependency'
      eventId: string
      date: string
      prerequisiteSeriesId: string
      prerequisiteDate: string
    }
  | { type: 'renamePerson'; id: PersonId; name: string }
  | { type: 'recolorPerson'; id: PersonId; color: string }
  // Personal (per-user) colour override for a person's lane — only the current
  // user sees it. `clearColorPref` reverts to the shared `Person.color`.
  | { type: 'setColorPref'; personId: PersonId; color: string }
  | { type: 'clearColorPref'; personId: PersonId }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }
  | { type: 'hydrate'; state: import('../types').AppState }
