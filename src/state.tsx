import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { AppState, CalendarEvent, ListItem, PersonId } from './types'
import { createStore, defaultState } from './store/store'
import { addDays } from './lib/dates'
import { occKey } from './lib/occurrences'
import { uid } from './lib/id'

const store = createStore()

type Action =
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
  | { type: 'hydrate'; state: AppState }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'addListItem': {
      const item: ListItem = {
        id: uid(),
        title: action.title,
        done: false,
        personId: action.personId,
        createdAt: Date.now(),
      }
      return { ...state, lists: [item, ...state.lists] }
    }
    case 'toggleListItem':
      return {
        ...state,
        lists: state.lists.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)),
      }
    case 'removeListItem':
      return { ...state, lists: state.lists.filter((t) => t.id !== action.id) }
    case 'addEvent':
      return { ...state, events: [...state.events, { ...action.event, id: uid() }] }
    case 'updateEvent':
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.event.id ? action.event : e)),
      }
    case 'removeEvent': {
      // Drop the event, any dangling dependsOn edges pointing at it, and all of
      // its per-occurrence state.
      const events = state.events
        .filter((e) => e.id !== action.id)
        .map((e) =>
          e.dependsOn?.includes(action.id)
            ? { ...e, dependsOn: e.dependsOn.filter((d) => d !== action.id) }
            : e,
        )
      const prefix = action.id + ':'
      const completions = Object.fromEntries(
        Object.entries(state.completions).filter(([k]) => !k.startsWith(prefix)),
      )
      return { ...state, events, completions }
    }
    case 'setOccurrenceDone': {
      const key = occKey(action.eventId, action.date)
      const prev = state.completions[key] ?? {}
      return { ...state, completions: { ...state.completions, [key]: { ...prev, done: action.done } } }
    }
    case 'toggleChecklistEntry': {
      const key = occKey(action.eventId, action.date)
      const prev = state.completions[key] ?? {}
      const checked = { ...(prev.checked ?? {}) }
      checked[action.entryId] = !checked[action.entryId]
      return { ...state, completions: { ...state.completions, [key]: { ...prev, checked } } }
    }
    case 'renamePerson':
      return {
        ...state,
        people: { ...state.people, [action.id]: { ...state.people[action.id], name: action.name } },
      }
    case 'recolorPerson':
      return {
        ...state,
        people: { ...state.people, [action.id]: { ...state.people[action.id], color: action.color } },
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
    default:
      return state
  }
}

interface Ctx {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const AppContext = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Start from the in-memory default, then hydrate asynchronously from the
  // store. The store is async so a network backend (Supabase) fits the seam.
  const [state, dispatch] = useReducer(reducer, undefined, defaultState)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    store.load().then((loaded) => {
      if (cancelled) return
      dispatch({ type: 'hydrate', state: loaded })
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Don't write the pre-hydration default back over stored data.
    if (!hydrated) return
    void store.save(state)
  }, [state, hydrated])

  const value = useMemo(() => ({ state, dispatch }), [state])
  if (!hydrated) return null
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
