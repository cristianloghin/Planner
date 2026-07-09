import type { AppState } from '../types'
import type { Action } from './actions'

/**
 * Offline durability for the reducer-owned slice: a per-account snapshot of
 * the last known state (for instant / offline startup) and a per-account queue
 * of not-yet-persisted actions (replayed in order when connectivity returns).
 * Both live in localStorage — the data volume is a household's events + lists,
 * well under the quota. The Query-owned slices persist separately
 * (lib/queryClient.ts).
 */

const snapshotKey = (accountId: string) => `planner.snapshot.v1.${accountId}`
const queueKey = (accountId: string) => `planner.pendingWrites.v1.${accountId}`

/** The data fields worth carrying across launches — weekStart/selectedDay are
 *  per-session navigation and re-derive from "today". */
type Snapshot = Pick<
  AppState,
  'people' | 'lists' | 'events' | 'dependencies' | 'listLinks' | 'preferences'
>

export function readSnapshot(accountId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(accountId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Snapshot>
    // Minimal shape check; a corrupt snapshot must not wedge startup.
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) return null
    return parsed as Snapshot
  } catch {
    return null
  }
}

export function writeSnapshot(accountId: string, state: AppState): void {
  const snap: Snapshot = {
    people: state.people,
    lists: state.lists,
    events: state.events,
    dependencies: state.dependencies,
    listLinks: state.listLinks,
    preferences: state.preferences,
  }
  try {
    localStorage.setItem(snapshotKey(accountId), JSON.stringify(snap))
  } catch {
    // Quota / private mode: startup just falls back to a network load.
  }
}

/** Sign-out privacy: drop the readable cached data. The pending-writes queue
 *  is deliberately kept — it holds unsent user intent and replays on the next
 *  sign-in to the same account. */
export function clearSnapshot(accountId: string): void {
  try {
    localStorage.removeItem(snapshotKey(accountId))
  } catch {
    /* ignore */
  }
}

export function readQueue(accountId: string): Action[] {
  try {
    const raw = localStorage.getItem(queueKey(accountId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as Action[]) : []
  } catch {
    return []
  }
}

export function writeQueue(accountId: string, actions: Action[]): void {
  try {
    if (actions.length === 0) localStorage.removeItem(queueKey(accountId))
    else localStorage.setItem(queueKey(accountId), JSON.stringify(actions))
  } catch {
    // Quota failure: the queue still lives in memory for this session.
  }
}

/** Pure UI navigation — never persisted, so never queued. */
const UI_ACTIONS = new Set(['shiftWeek', 'setWeek', 'shiftDay', 'setDay', 'hydrate'])

export function isPersistedAction(action: Action): boolean {
  return !UI_ACTIONS.has(action.type)
}

/**
 * Backfill the ids the reducer just minted onto a queued create action, so a
 * replay against a LATER state (after an offline restart, or after further
 * dispatches) still resolves its own row instead of "the last one appended".
 */
export function enrichForQueue(action: Action, next: AppState): Action {
  switch (action.type) {
    case 'addEvent':
      return action.id ? action : { ...action, id: next.events[next.events.length - 1]?.id }
    case 'addList':
      return action.id ? action : { ...action, id: next.lists[next.lists.length - 1]?.id }
    case 'addListItem': {
      if (action.id) return action
      const list = next.lists.find((l) => l.id === action.listId)
      return { ...action, id: list?.items[list.items.length - 1]?.id }
    }
    default:
      return action
  }
}

/**
 * Was this failure the network (retry later) rather than the server rejecting
 * the write (drop + resync)? supabase-js surfaces fetch failures as errors
 * whose message carries the fetch wording; navigator.onLine catches the
 * clear-cut case. A misclassification towards "server" is safe — it falls
 * back to the drop-and-reload path instead of retrying forever.
 */
export function isNetworkError(e: unknown): boolean {
  // Explicit `=== false`: environments without the API (e.g. Node in tests)
  // expose navigator but not onLine, and undefined must not read as offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : ''
  return /fetch|network|load failed|connection|timed?\s?out/i.test(message)
}
