import type { CalendarEvent, EventTemplate, OccurrenceStatusCode, PersonId } from '../types'

/**
 * Every state change flows through one of these. The reducer applies it to
 * in-memory state; the store persists it (see `ScheduleStore.apply`). Shared
 * here so both sides agree without a circular import through `state.tsx`.
 */
export type Action =
  // Named lists (the `list` table). Items live nested under their list.
  | { type: 'addList'; title: string }
  | { type: 'renameList'; id: string; title: string }
  | { type: 'removeList'; id: string }
  | {
      type: 'addListItem'
      listId: string
      title: string
      personId: PersonId | null
      group: string | null
      dueOn: string | null
    }
  | { type: 'toggleListItem'; listId: string; itemId: string }
  | { type: 'removeListItem'; listId: string; itemId: string }
  // Set (or clear, with dueOn: null) a to-do's optional deadline.
  | { type: 'setListItemDue'; listId: string; itemId: string; dueOn: string | null }
  // Surface a to-do inside a concrete occurrence (`list_item_event_link`). The
  // occurrence is (eventId, date); the tick stays on the item's own `done`.
  | { type: 'linkListItem'; eventId: string; date: string; itemId: string }
  | { type: 'unlinkListItem'; eventId: string; date: string; itemId: string }
  // `templateId` is pure provenance — the source template, written to the new
  // series' `template_id` column. Omitted for an event built from scratch.
  | { type: 'addEvent'; event: Omit<CalendarEvent, 'id'>; templateId?: string }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  // Reusable event blueprints (`event_series` with `is_template = true`).
  | { type: 'addTemplate'; template: Omit<EventTemplate, 'id'> }
  | { type: 'updateTemplate'; template: EventTemplate }
  | { type: 'removeTemplate'; id: string }
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
