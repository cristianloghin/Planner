import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { AppState, CalendarEvent, PersonId, Reminder, Task } from './types'
import { createStore } from './store/store'
import { addDays } from './lib/dates'

const store = createStore()

type Action =
  | { type: 'addTask'; title: string; personId: PersonId | null }
  | { type: 'toggleTask'; id: string }
  | { type: 'removeTask'; id: string }
  | { type: 'addEvent'; event: Omit<CalendarEvent, 'id'> }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  | { type: 'addReminder'; reminder: Omit<Reminder, 'id'> }
  | { type: 'updateReminder'; reminder: Reminder }
  | { type: 'removeReminder'; id: string }
  | { type: 'renamePerson'; id: PersonId; name: string }
  | { type: 'recolorPerson'; id: PersonId; color: string }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }

const id = () => Math.random().toString(36).slice(2, 10)

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addTask': {
      const task: Task = {
        id: id(),
        title: action.title,
        done: false,
        personId: action.personId,
        createdAt: Date.now(),
      }
      return { ...state, tasks: [task, ...state.tasks] }
    }
    case 'toggleTask':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)),
      }
    case 'removeTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) }
    case 'addEvent':
      return { ...state, events: [...state.events, { ...action.event, id: id() }] }
    case 'updateEvent':
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.event.id ? action.event : e)),
      }
    case 'removeEvent':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) }
    case 'addReminder':
      return { ...state, reminders: [...state.reminders, { ...action.reminder, id: id() }] }
    case 'updateReminder':
      return {
        ...state,
        reminders: state.reminders.map((r) => (r.id === action.reminder.id ? action.reminder : r)),
      }
    case 'removeReminder':
      return { ...state, reminders: state.reminders.filter((r) => r.id !== action.id) }
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
  const [state, dispatch] = useReducer(reducer, undefined, () => store.load())

  useEffect(() => {
    store.save(state)
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
