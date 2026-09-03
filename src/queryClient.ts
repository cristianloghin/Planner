import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { MutationCache, QueryClient } from '@tanstack/react-query'

/**
 * Bump when a Query-owned slice changes its persisted shape (query key layout
 * or row mapping) — a mismatched buster discards the stored cache instead of
 * hydrating stale-shaped data into the new code.
 *
 * v2: occurrence writes moved to domains/occurrences and are registered under a
 * new mutation key with different values. A write queued offline under the old
 * key would come back with nothing registered to run it, and query-core drops
 * such a write silently rather than waiting. Discarding the stored cache loses
 * it too, but visibly and once, rather than leaving it to fail unnoticed.
 */
const CACHE_BUSTER = 'v3'
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Shared cache for the slices migrated to TanStack Query (templates and
// per-occurrence completions). The reducer-backed store still owns everything
// else; the two coexist. Lives in its own module so auth can clear it on
// sign-out.
// ---- The last rejected write, for the shell's banner ----------------------
// A write only errors once it has reached the server and been refused — an
// offline write pauses instead — so an error here is a rejection the user
// should hear about. The domain has already rolled its optimistic patch back.
let writeError: string | null = null
const writeErrorListeners = new Set<() => void>()
const notifyWriteError = () => {
  for (const listener of writeErrorListeners) listener()
}
export function subscribeWriteError(listener: () => void): () => void {
  writeErrorListeners.add(listener)
  return () => writeErrorListeners.delete(listener)
}
export function getWriteError(): string | null {
  return writeError
}
export function dismissWriteError(): void {
  writeError = null
  notifyWriteError()
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      console.error('A change was rejected by the server:', error)
      writeError = 'A change could not be saved.'
      notifyWriteError()
    },
  }),
  defaultOptions: {
    queries: {
      // Keep entries alive as long as the persisted cache is valid: gcTime
      // below the persister's maxAge would garbage-collect data out of the
      // snapshot and defeat offline startup.
      gcTime: QUERY_CACHE_MAX_AGE_MS,
    },
  },
})

/**
 * Persists the query cache to localStorage so an offline (or slow) launch
 * renders last-known data instantly. All query keys are account-scoped, so a
 * different sign-in simply misses; sign-out clears the client, which the
 * persister mirrors into storage.
 */
export const queryPersister = createSyncStoragePersister({
  storage: typeof localStorage === 'undefined' ? undefined : localStorage,
  key: 'planner.queryCache.v1',
  throttleTime: 1000,
})

export const queryPersistOptions = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE_MS,
  buster: CACHE_BUSTER,
}
