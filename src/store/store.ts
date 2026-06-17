import type { AppState, CalendarEvent, PersonId, Recurrence } from '../types'
import { addDays, mondayOf } from '../lib/dates'

/**
 * Older saved shapes we still read:
 *   - `personId` ('me' | 'partner' | 'kid' | 'both') before `attendees`.
 *   - `day` (0-6 weekday) before events were anchored to an absolute `date`.
 */
interface LegacyEvent {
  id: string
  title: string
  day?: number
  date?: string
  allDay?: boolean
  start?: number
  end?: number
  days?: number
  recurrence?: Recurrence
  attendees?: PersonId[]
  personId?: PersonId | 'both'
  notes?: string
}

function migrateEvent(e: LegacyEvent, weekStart: string): CalendarEvent {
  const attendees: PersonId[] =
    Array.isArray(e.attendees) && e.attendees.length
      ? e.attendees
      : e.personId === 'both'
        ? ['me', 'partner']
        : [(e.personId as PersonId) ?? 'me']

  // Weekday-based events become one-offs on the matching day of their week.
  const date = e.date ?? addDays(weekStart, e.day ?? 0)

  return {
    id: e.id,
    title: e.title,
    date,
    allDay: e.allDay ?? false,
    start: e.start ?? 9 * 60,
    end: e.end ?? 10 * 60,
    days: e.days ?? 1,
    recurrence: e.recurrence,
    attendees,
    notes: e.notes,
  }
}

/**
 * Storage abstraction. Phase 1 is backed by localStorage (single device).
 * To add real cross-device sync later (Supabase/Firebase/custom API), implement
 * this same interface and swap which one `createStore()` returns — nothing else
 * in the app needs to change.
 */
export interface ScheduleStore {
  load(): AppState
  save(state: AppState): void
}

export function defaultState(): AppState {
  const today = new Date()
  return {
    people: {
      me: { id: 'me', name: 'Me', color: '#4f46e5' },
      partner: { id: 'partner', name: 'Partner', color: '#ec4899' },
      kid: { id: 'kid', name: 'Nora', color: '#14b8a6' },
    },
    tasks: [],
    events: [],
    weekStart: mondayOf(today),
    selectedDay: (today.getDay() + 6) % 7, // 0 = Monday
  }
}

const STORAGE_KEY = 'planner.state.v1'

export class LocalStorageStore implements ScheduleStore {
  load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultState()
      const parsed = JSON.parse(raw) as Partial<AppState>
      const base = defaultState()
      // Shallow-merge over defaults so missing/added fields stay valid, but
      // deep-merge people so newly-added members (e.g. Nora) appear for users
      // whose saved state predates them, while keeping their custom names/colours.
      const weekStart = parsed.weekStart ?? base.weekStart
      const events = (parsed.events ?? base.events).map((e) => migrateEvent(e as LegacyEvent, weekStart))
      return {
        ...base,
        ...parsed,
        people: { ...base.people, ...(parsed.people ?? {}) },
        events,
      } as AppState
    } catch {
      return defaultState()
    }
  }

  save(state: AppState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota / private-mode write failures for now.
    }
  }
}

export function createStore(): ScheduleStore {
  return new LocalStorageStore()
}
