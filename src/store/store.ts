import type { AppState } from '../types'
import { mondayOf } from '../lib/dates'

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
      return {
        ...base,
        ...parsed,
        people: { ...base.people, ...(parsed.people ?? {}) },
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
