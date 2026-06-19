import type { AppState } from '../types'
import type { Action } from './actions'
import { mondayOf } from '../lib/dates'
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
 *  - `subscribe(onChange)` fires when the backing data changes elsewhere (a
 *    partner's edit) and returns an unsubscribe fn. localStorage has no remote
 *    changes, so it's a no-op. (This is the seam a future TanStack Query layer
 *    would hook for cache invalidation.)
 */
export interface ScheduleStore {
  load(): Promise<AppState>
  apply(action: Action, next: AppState): Promise<void>
  subscribe(onChange: () => void): () => void
}

export function defaultState(): AppState {
  const today = new Date()
  return {
    people: {
      me: { id: 'me', name: 'Me', color: '#4f46e5', kind: 'adult', sortOrder: 0 },
      partner: { id: 'partner', name: 'Partner', color: '#ec4899', kind: 'adult', sortOrder: 1 },
      kid: { id: 'kid', name: 'Nora', color: '#14b8a6', kind: 'child', sortOrder: 2 },
    },
    lists: [],
    events: [],
    completions: {},
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
      // Shallow-merge over defaults so missing/added fields stay valid, but
      // deep-merge people so newly-added members appear for users whose saved
      // state predates them, while keeping their custom names/colours.
      return {
        ...base,
        ...parsed,
        people: { ...base.people, ...(parsed.people ?? {}) },
        lists: parsed.lists ?? base.lists,
        events: parsed.events ?? base.events,
        completions: parsed.completions ?? base.completions,
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

  // Single-device store: nothing changes it remotely.
  subscribe(): () => void {
    return () => {}
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
