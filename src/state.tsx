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
import type { AppState, ListItem, TodoList } from './types'
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
    case 'addList': {
      const list: TodoList = {
        id: uid(),
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
    case 'removeList':
      return { ...state, lists: state.lists.filter((l) => l.id !== action.id) }
    case 'addListItem': {
      const item: ListItem = {
        id: uid(),
        title: action.title,
        done: false,
        personId: action.personId,
        groupLabel: null,
        dueOn: null,
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
                items: l.items.map((t) =>
                  t.id === action.itemId ? { ...t, done: !t.done } : t,
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
      }
    case 'addEvent':
      return { ...state, events: [...state.events, { ...action.event, id: uid() }] }
    case 'updateEvent':
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.event.id ? action.event : e)),
      }
    case 'removeEvent': {
      // Drop the event, all of its per-occurrence state, and every dependency
      // edge that touches it — whether it's the dependent occurrence (key prefix)
      // or a prerequisite of someone else's occurrence (DB cascades both ends).
      const events = state.events.filter((e) => e.id !== action.id)
      const prefix = action.id + ':'
      const completions = Object.fromEntries(
        Object.entries(state.completions).filter(([k]) => !k.startsWith(prefix)),
      )
      const dependencies: typeof state.dependencies = {}
      for (const [k, edges] of Object.entries(state.dependencies)) {
        if (k.startsWith(prefix)) continue
        const kept = edges.filter((e) => e.prerequisiteSeriesId !== action.id)
        if (kept.length) dependencies[k] = kept
      }
      return { ...state, events, completions, dependencies }
    }
    case 'setOccurrenceStatus': {
      const key = occKey(action.eventId, action.date)
      const { status: _drop, ...rest } = state.completions[key] ?? {}
      const next = action.status === null ? rest : { ...rest, status: action.status }
      return { ...state, completions: { ...state.completions, [key]: next } }
    }
    case 'addDependency': {
      const key = occKey(action.eventId, action.date)
      const edges = state.dependencies[key] ?? []
      // Dedupe by prerequisite slot; a re-add updates the required status.
      const without = edges.filter(
        (e) =>
          !(e.prerequisiteSeriesId === action.prerequisiteSeriesId && e.prerequisiteDate === action.prerequisiteDate),
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
          !(e.prerequisiteSeriesId === action.prerequisiteSeriesId && e.prerequisiteDate === action.prerequisiteDate),
      )
      const dependencies = { ...state.dependencies }
      if (edges.length) dependencies[key] = edges
      else delete dependencies[key]
      return { ...state, dependencies }
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
  /**
   * Bracket an in-progress edit (open editor) so a realtime reload doesn't pull
   * data out from under it. A deferred reload runs when the last edit ends.
   */
  beginEdit: () => void
  endEdit: () => void
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

  // ---- realtime: reload on a partner's change ----------------------------
  // Edit guard: while an editor is open we defer reloads (the open form holds an
  // unsaved draft) and flush once it closes.
  const editCountRef = useRef(0)
  const pendingReloadRef = useRef(false)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const reloadFromStore = useCallback(async () => {
    const fresh = await storeRef.current!.load()
    const prev = stateRef.current
    // weekStart/selectedDay are local UI navigation, not server data — keep them
    // so a remote change never yanks the user back to today's view.
    const merged = prev
      ? { ...fresh, weekStart: prev.weekStart, selectedDay: prev.selectedDay }
      : fresh
    stateRef.current = merged
    setState(merged)
  }, [])

  const onRemoteChange = useCallback(() => {
    if (editCountRef.current > 0) {
      pendingReloadRef.current = true
      return
    }
    clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void reloadFromStore(), 300)
  }, [reloadFromStore])

  const beginEdit = useCallback(() => {
    editCountRef.current += 1
  }, [])

  const endEdit = useCallback(() => {
    editCountRef.current = Math.max(0, editCountRef.current - 1)
    if (editCountRef.current === 0 && pendingReloadRef.current) {
      pendingReloadRef.current = false
      void reloadFromStore()
    }
  }, [reloadFromStore])

  useEffect(() => {
    const unsubscribe = storeRef.current!.subscribe(onRemoteChange)
    return () => {
      unsubscribe()
      clearTimeout(reloadTimerRef.current)
    }
  }, [onRemoteChange])

  const value = useMemo(
    () => (state ? { state, dispatch, beginEdit, endEdit } : null),
    [state, dispatch, beginEdit, endEdit],
  )
  if (!value) return null
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
