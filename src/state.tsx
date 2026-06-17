import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type {
  AppState,
  CalendarEvent,
  Member,
  MemberId,
  Reminder,
  SyncMeta,
} from './types'
import { createStore } from './store/store'
import { addDays } from './lib/dates'
import { softDelete, touch, withMeta } from './lib/sync'

const store = createStore()

/** New-entity payloads: the fields a caller supplies; the reducer adds id +
 *  sync metadata + householdId. */
type EventInput = Omit<CalendarEvent, keyof SyncMeta | 'householdId'>
type ReminderInput = Omit<Reminder, keyof SyncMeta | 'householdId'>
type MemberInput = Omit<Member, keyof SyncMeta | 'householdId'>

type Action =
  | { type: 'addTask'; title: string; memberId: MemberId | null }
  | { type: 'toggleTask'; id: string }
  | { type: 'removeTask'; id: string }
  | { type: 'addEvent'; event: EventInput }
  | { type: 'updateEvent'; event: CalendarEvent }
  | { type: 'removeEvent'; id: string }
  | { type: 'addReminder'; reminder: ReminderInput }
  | { type: 'updateReminder'; reminder: Reminder }
  | { type: 'removeReminder'; id: string }
  | { type: 'addMember'; member: MemberInput }
  | { type: 'updateMember'; member: Member }
  | { type: 'removeMember'; id: string }
  | { type: 'renameHousehold'; name: string }
  | { type: 'shiftWeek'; delta: number }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'shiftDay'; delta: number }
  | { type: 'setDay'; day: number }

/** Replace the matching row, bumping updatedAt. */
function replace<T extends SyncMeta>(xs: T[], next: T): T[] {
  return xs.map((x) => (x.id === next.id ? touch(next) : x))
}

/** Soft-delete the matching row. */
function remove<T extends SyncMeta>(xs: T[], id: string): T[] {
  return xs.map((x) => (x.id === id ? softDelete(x) : x))
}

function reducer(state: AppState, action: Action): AppState {
  const hid = state.household.id
  switch (action.type) {
    case 'addTask':
      return {
        ...state,
        tasks: [
          withMeta({ householdId: hid, title: action.title, done: false, memberId: action.memberId }),
          ...state.tasks,
        ],
      }
    case 'toggleTask':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? touch({ ...t, done: !t.done }) : t)),
      }
    case 'removeTask':
      return { ...state, tasks: remove(state.tasks, action.id) }

    case 'addEvent':
      return { ...state, events: [...state.events, withMeta({ ...action.event, householdId: hid })] }
    case 'updateEvent':
      return { ...state, events: replace(state.events, action.event) }
    case 'removeEvent':
      return { ...state, events: remove(state.events, action.id) }

    case 'addReminder':
      return {
        ...state,
        reminders: [...state.reminders, withMeta({ ...action.reminder, householdId: hid })],
      }
    case 'updateReminder':
      return { ...state, reminders: replace(state.reminders, action.reminder) }
    case 'removeReminder':
      return { ...state, reminders: remove(state.reminders, action.id) }

    case 'addMember':
      return { ...state, members: [...state.members, withMeta({ ...action.member, householdId: hid })] }
    case 'updateMember':
      return { ...state, members: replace(state.members, action.member) }
    case 'removeMember':
      return { ...state, members: remove(state.members, action.id) }

    case 'renameHousehold':
      return { ...state, household: touch({ ...state.household, name: action.name }) }

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
