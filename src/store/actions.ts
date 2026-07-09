import type { ColorKey } from '../lib/palette'
import type { CalendarEvent, OccurrenceStatusCode, PersonId } from '../types'

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
      /** Optional caller-minted id (see `addList.id`); the reducer mints one
       *  when absent, and the dispatcher backfills it onto the queued action
       *  so an offline replay targets the same row. */
      id?: string
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
  | { type: 'addEvent'; event: Omit<CalendarEvent, 'id'>; templateId?: string; id?: string }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  // "Edit this and all following": split the series at `fromDate` into a new
  // series carrying `event`'s edits, capping the old one just before `fromDate`.
  | { type: 'splitSeries'; eventId: string; fromDate: string; event: Omit<CalendarEvent, 'id'> }
  // (Not here: templates and per-occurrence state — status, checklist ticks,
  // timing overrides — moved off the reducer to TanStack Query; see
  // src/data/templates.ts and src/data/completions.ts.)
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
  // Stamp the device's IANA timezone into the per-user preferences, for the
  // server-side reminder sender. Dispatched automatically on startup.
  | { type: 'setTimezone'; timezone: string }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }
  | { type: 'hydrate'; state: import('../types').AppState }
