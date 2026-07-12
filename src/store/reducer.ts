import { addDays, mondayOf, weekdayIndex } from '../lib/dates'
import { uid } from '../lib/id'
import { occKey } from '../lib/occurrences'
import type { AppState, ListItem, TodoList } from '../types'
import type { Action } from './actions'

// The pure in-memory half of a state change: every Action is applied here
// optimistically, then persisted by ScheduleStore.apply (see src/state.tsx for
// the queue that keeps the two in step). No I/O, no side effects — which is
// also what keeps it unit-testable (reducer.test.ts).

/**
 * Remove the given to-do ids from every occurrence's link list, dropping keys
 * that empty out. Used to mirror the DB's cascade when an item or list is gone.
 */
function dropLinkedItems(
  listLinks: AppState['listLinks'],
  removedIds: string[],
): AppState['listLinks'] {
  if (removedIds.length === 0) return listLinks
  const drop = new Set(removedIds)
  const out: AppState['listLinks'] = {}
  for (const [k, ids] of Object.entries(listLinks)) {
    const kept = ids.filter((id) => !drop.has(id))
    if (kept.length) out[k] = kept
  }
  return out
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'addList': {
      const list: TodoList = {
        id: action.id ?? uid(),
        title: action.title,
        sortOrder: state.lists.length,
        items: [],
      }
      return { ...state, lists: [...state.lists, list] }
    }
    case 'renameList':
      return {
        ...state,
        lists: state.lists.map((l) => (l.id === action.id ? { ...l, title: action.title } : l)),
      }
    case 'removeList': {
      const removed = state.lists.find((l) => l.id === action.id)
      return {
        ...state,
        lists: state.lists.filter((l) => l.id !== action.id),
        // The DB cascades the list's items and their links; mirror it in memory.
        listLinks: removed
          ? dropLinkedItems(
              state.listLinks,
              removed.items.map((i) => i.id),
            )
          : state.listLinks,
      }
    }
    case 'addListItem': {
      const item: ListItem = {
        id: action.id ?? uid(),
        title: action.title,
        done: false,
        personId: action.personId,
        groupLabel: action.group,
        dueOn: action.dueOn,
        sortOrder: 0, // set below from the target list's length
        createdAt: Date.now(),
      }
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.listId
            ? { ...l, items: [...l.items, { ...item, sortOrder: l.items.length }] }
            : l,
        ),
      }
    }
    case 'toggleListItem':
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.listId
            ? {
                ...l,
                items: l.items.map((t) => (t.id === action.itemId ? { ...t, done: !t.done } : t)),
              }
            : l,
        ),
      }
    case 'editListItem':
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.listId
            ? {
                ...l,
                items: l.items.map((t) =>
                  t.id === action.itemId
                    ? {
                        ...t,
                        title: action.title,
                        personId: action.personId,
                        groupLabel: action.group,
                      }
                    : t,
                ),
              }
            : l,
        ),
      }
    case 'setListItemDue':
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.listId
            ? {
                ...l,
                items: l.items.map((t) =>
                  t.id === action.itemId ? { ...t, dueOn: action.dueOn } : t,
                ),
              }
            : l,
        ),
      }
    case 'removeListItem':
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.listId
            ? { ...l, items: l.items.filter((t) => t.id !== action.itemId) }
            : l,
        ),
        // The DB cascades the item's links; drop them in memory too.
        listLinks: dropLinkedItems(state.listLinks, [action.itemId]),
      }
    case 'addEvent':
      return { ...state, events: [...state.events, { ...action.event, id: action.id ?? uid() }] }
    case 'updateEvent':
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.event.id ? action.event : e)),
      }
    case 'removeEvent': {
      // Drop the event and every dependency edge that touches it — whether
      // it's the dependent occurrence (key prefix) or a prerequisite of someone
      // else's occurrence (DB cascades both ends). Its per-occurrence state is
      // Query-owned (src/data/completions.ts); realtime invalidation prunes it.
      const events = state.events.filter((e) => e.id !== action.id)
      const prefix = `${action.id}:`
      const dependencies: typeof state.dependencies = {}
      for (const [k, edges] of Object.entries(state.dependencies)) {
        if (k.startsWith(prefix)) continue
        const kept = edges.filter((e) => e.prerequisiteSeriesId !== action.id)
        if (kept.length) dependencies[k] = kept
      }
      // Drop every to-do link surfaced on this event's occurrences (the DB
      // cascades them via series_id); the to-dos themselves are untouched.
      const listLinks = Object.fromEntries(
        Object.entries(state.listLinks).filter(([k]) => !k.startsWith(prefix)),
      )
      return { ...state, events, dependencies, listLinks }
    }
    case 'splitSeries': {
      // Optimistic only: cap the old series and append the edited clone. The
      // store runs `split_series` + a full reload, which replaces this with the
      // authoritative shape (real new id, migrated per-occurrence rows).
      const old = state.events.find((e) => e.id === action.eventId)
      if (!old || !old.recurrence) return state
      const events = state.events.map((e) =>
        e.id === action.eventId && e.recurrence
          ? { ...e, recurrence: { ...e.recurrence, until: addDays(action.fromDate, -1) } }
          : e,
      )
      events.push({ ...action.event, id: uid() })
      return { ...state, events }
    }
    case 'addDependency': {
      const key = occKey(action.eventId, action.date)
      const edges = state.dependencies[key] ?? []
      // Dedupe by prerequisite slot; a re-add updates the required status.
      const without = edges.filter(
        (e) =>
          !(
            e.prerequisiteSeriesId === action.prerequisiteSeriesId &&
            e.prerequisiteDate === action.prerequisiteDate
          ),
      )
      const edge = {
        prerequisiteSeriesId: action.prerequisiteSeriesId,
        prerequisiteDate: action.prerequisiteDate,
        requiredStatus: action.requiredStatus,
      }
      return { ...state, dependencies: { ...state.dependencies, [key]: [...without, edge] } }
    }
    case 'removeDependency': {
      const key = occKey(action.eventId, action.date)
      const edges = (state.dependencies[key] ?? []).filter(
        (e) =>
          !(
            e.prerequisiteSeriesId === action.prerequisiteSeriesId &&
            e.prerequisiteDate === action.prerequisiteDate
          ),
      )
      const dependencies = { ...state.dependencies }
      if (edges.length) dependencies[key] = edges
      else delete dependencies[key]
      return { ...state, dependencies }
    }
    case 'linkListItem': {
      const key = occKey(action.eventId, action.date)
      const ids = state.listLinks[key] ?? []
      if (ids.includes(action.itemId)) return state
      return { ...state, listLinks: { ...state.listLinks, [key]: [...ids, action.itemId] } }
    }
    case 'unlinkListItem': {
      const key = occKey(action.eventId, action.date)
      const ids = (state.listLinks[key] ?? []).filter((id) => id !== action.itemId)
      const listLinks = { ...state.listLinks }
      if (ids.length) listLinks[key] = ids
      else delete listLinks[key]
      return { ...state, listLinks }
    }
    case 'renamePerson':
      return {
        ...state,
        people: { ...state.people, [action.id]: { ...state.people[action.id], name: action.name } },
      }
    case 'recolorPerson':
      return {
        ...state,
        people: {
          ...state.people,
          [action.id]: { ...state.people[action.id], color: action.color },
        },
      }
    case 'setColorPref':
      return {
        ...state,
        preferences: {
          ...state.preferences,
          personColors: { ...state.preferences.personColors, [action.personId]: action.color },
        },
      }
    case 'clearColorPref': {
      const personColors = { ...state.preferences.personColors }
      delete personColors[action.personId]
      return { ...state, preferences: { ...state.preferences, personColors } }
    }
    case 'setTimezone':
      return { ...state, preferences: { ...state.preferences, timezone: action.timezone } }
    case 'setWeekLayout':
      return { ...state, preferences: { ...state.preferences, weekLayout: action.layout } }
    case 'shiftWeek':
      return { ...state, weekStart: addDays(state.weekStart, action.delta * 7) }
    case 'setWeek':
      return { ...state, weekStart: action.weekStart }
    case 'shiftDay': {
      let day = state.selectedDay + action.delta
      let weekStart = state.weekStart
      if (day < 0) {
        day = 6
        weekStart = addDays(weekStart, -7)
      } else if (day > 6) {
        day = 0
        weekStart = addDays(weekStart, 7)
      }
      return { ...state, selectedDay: day, weekStart }
    }
    case 'setDay':
      return { ...state, selectedDay: action.day }
    case 'goToDate':
      return {
        ...state,
        weekStart: mondayOf(new Date(`${action.date}T00:00:00`)),
        selectedDay: weekdayIndex(action.date),
      }
    default:
      return state
  }
}
