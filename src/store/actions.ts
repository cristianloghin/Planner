import type { CalendarEvent, OccurrenceStatusCode } from '../types'

/**
 * Every state change flows through one of these. The reducer applies it to
 * in-memory state; the store persists it (see `ScheduleStore.apply`). Shared
 * here so both sides agree without a circular import through `state.tsx`.
 */
export type Action =
  // `templateId` is pure provenance — the source template, written to the new
  // series' `template_id` column. Omitted for an event built from scratch.
  | { type: 'addEvent'; event: Omit<CalendarEvent, 'id'>; templateId?: string; id?: string }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  // "Edit this and all following": split the series at `fromDate` into a new
  // series carrying `event`'s edits, capping the old one just before `fromDate`.
  | { type: 'splitSeries'; eventId: string; fromDate: string; event: Omit<CalendarEvent, 'id'> }
  // (Not here: templates and per-occurrence state — status, checklist ticks,
  // timing overrides — moved off the reducer to TanStack Query; see
  // src/domains/events and src/domains/occurrences.)
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
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }
  // Navigate both axes at once: the week containing ISO `date`, with that day
  // selected. What every "jump to this date" path (month cell, search hit,
  // today button) wants.
  | { type: 'goToDate'; date: string }
  | { type: 'hydrate'; state: import('../types').AppState }
