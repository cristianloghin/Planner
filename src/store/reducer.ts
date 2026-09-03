import { addDays, mondayOf, weekdayIndex } from '../assets/utils/dates'
import { uid } from '../assets/utils/id'
import { occKey } from '../lib/occurrences'
import type { AppState } from '../types'
import type { Action } from './actions'

// The pure in-memory half of a state change: every Action is applied here
// optimistically, then persisted by ScheduleStore.apply (see src/state.tsx for
// the queue that keeps the two in step). No I/O, no side effects — which is
// also what keeps it unit-testable (reducer.test.ts).

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
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
      // Query-owned (src/domains/occurrences); realtime invalidation prunes it.
      const events = state.events.filter((e) => e.id !== action.id)
      const prefix = `${action.id}:`
      const dependencies: typeof state.dependencies = {}
      for (const [k, edges] of Object.entries(state.dependencies)) {
        if (k.startsWith(prefix)) continue
        const kept = edges.filter((e) => e.prerequisiteSeriesId !== action.id)
        if (kept.length) dependencies[k] = kept
      }
      return { ...state, events, dependencies }
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
