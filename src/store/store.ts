import { mondayOf } from '../assets/utils/dates'
import type { AppState } from '../types'
import type { Action } from './actions'
import { SupabaseStore } from './supabaseStore'

/**
 * Storage abstraction. Two backings exist: `LocalStorageStore` (single device,
 * the Phase-1 fallback) and `SupabaseStore` (cross-device sync). The app talks
 * only to this interface, so swapping which one `createStore()` returns is the
 * whole switch.
 *
 *  - `load()` reads the full state once on startup (async — a network backend
 *    fits without reshaping the app).
 *  - `apply(action, next)` persists a single change. The localStorage store
 *    ignores the action and saves the whole `next` state; the Supabase store
 *    translates the action into targeted row writes.
 *
 * Being told about a partner's change is not the store's job: the realtime
 * channel lives in `client/realtime.ts` and is routed by `services/realtime`.
 */
export interface ScheduleStore {
  load(): Promise<AppState>
  apply(action: Action, next: AppState): Promise<void>
}

export function defaultState(): AppState {
  const today = new Date()
  return {
    events: [],
    dependencies: {},
    weekStart: mondayOf(today),
    selectedDay: (today.getDay() + 6) % 7, // 0 = Monday
  }
}

// v2: the start/duration + attachments + completions model. The v1 key (a
// different event shape) is intentionally not read — we're still iterating on
// shapes, so stale data is simply ignored rather than migrated.
const STORAGE_KEY = 'planner.state.v2'

export class LocalStorageStore implements ScheduleStore {
  async load(): Promise<AppState> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultState()
      const parsed = JSON.parse(raw) as Partial<AppState>
      const base = defaultState()
      // Shallow-merge over defaults so missing/added fields stay valid.
      return {
        ...base,
        ...parsed,
        events: parsed.events ?? base.events,
        dependencies: parsed.dependencies ?? base.dependencies,
      } as AppState
    } catch {
      return defaultState()
    }
  }

  // localStorage has no concept of granular writes — persist the whole state.
  async apply(_action: Action, next: AppState): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore quota / private-mode write failures for now.
    }
  }
}

/**
 * The active store. With an authenticated `account`/`user` it's Supabase-backed
 * (cross-device sync); without, it falls back to localStorage (e.g. tests).
 */
export function createStore(ctx?: { accountId: string; userId: string }): ScheduleStore {
  if (ctx) return new SupabaseStore(ctx.accountId, ctx.userId)
  return new LocalStorageStore()
}
