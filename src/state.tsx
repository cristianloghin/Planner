import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppState, ListItem } from './types'
import { createStore, type ScheduleStore } from './store/store'
import type { Action } from './store/actions'
import { useAuth } from './auth'
import { addDays } from './lib/dates'
import { occKey } from './lib/occurrences'
import { uid } from './lib/id'

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
  dispatch: (action: Action) => void
}

const AppContext = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { accountId, session } = useAuth()

  // The store is created once. Mounted only when authed with an account (the
  // Root gate guarantees this), so it's the Supabase-backed store.
  const storeRef = useRef<ScheduleStore>()
  if (!storeRef.current) {
    storeRef.current =
      accountId && session
        ? createStore({ accountId, userId: session.user.id })
        : createStore()
  }

  // State lives in useState; a ref mirrors it so the custom dispatch can compute
  // the next state synchronously (and pass it to the store) without a stale read.
  const [state, setState] = useState<AppState | null>(null)
  const stateRef = useRef<AppState | null>(null)

  useEffect(() => {
    let cancelled = false
    storeRef.current!.load().then((loaded) => {
      if (cancelled) return
      stateRef.current = loaded
      setState(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const dispatch = useCallback((action: Action) => {
    const prev = stateRef.current
    if (!prev) return
    const next = reducer(prev, action)
    stateRef.current = next
    setState(next)
    void storeRef.current!.apply(action, next).catch((e) =>
      console.error('Failed to persist change:', e),
    )
  }, [])

  const value = useMemo(() => (state ? { state, dispatch } : null), [state, dispatch])
  if (!value) return null
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
