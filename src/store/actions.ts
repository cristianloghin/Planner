import type { CalendarEvent, OccurrenceStatusCode, PersonId } from '../types'
import type { ColorKey } from '../lib/palette'

/**
 * Every state change flows through one of these. The reducer applies it to
 * in-memory state; the store persists it (see `ScheduleStore.apply`). Shared
 * here so both sides agree without a circular import through `state.tsx`.
 */
export type Action =
  // Named lists (the `list` table). Items live nested under their list.
  // `id` lets the caller mint the id up front (e.g. to add items to the new
  // list in the same breath without guessing which list the reducer created).
  | { type: 'addList'; title: string; id?: string }
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
  // Edit a to-do's content (used by the list's edit mode): its text, assignee,
  // and in-list header in one write. The deadline has its own action below.
  | {
      type: 'editListItem'
      listId: string
      itemId: string
      title: string
      personId: PersonId | null
      group: string | null
    }
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
  // One-off timing override for a single occurrence (`event_occurrence`'s
  // `rescheduled_to`/`rescheduled_duration`). `date` is the occurrence's fixed
  // date; `start` is the new `yyyy-mm-ddThh:mm` on that date, `duration` minutes.
  | { type: 'setOccurrenceOverride'; eventId: string; date: string; start: string; duration: number }
  | { type: 'clearOccurrenceOverride'; eventId: string; date: string }
  // "Edit this and all following": split the series at `fromDate` into a new
  // series carrying `event`'s edits, capping the old one just before `fromDate`.
  | { type: 'splitSeries'; eventId: string; fromDate: string; event: Omit<CalendarEvent, 'id'> }
  // (Templates moved off the reducer — owned by TanStack Query, src/data/templates.ts.)
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
  | { type: 'recolorPerson'; id: PersonId; color: ColorKey }
  // Personal (per-user) colour override for a person's lane — only the current
  // user sees it. `clearColorPref` reverts to the shared `Person.color`.
  | { type: 'setColorPref'; personId: PersonId; color: ColorKey }
  | { type: 'clearColorPref'; personId: PersonId }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }
  | { type: 'hydrate'; state: import('../types').AppState }
