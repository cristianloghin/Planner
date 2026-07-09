import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

/**
 * Bump when a Query-owned slice changes its persisted shape (query key layout
 * or row mapping) — a mismatched buster discards the stored cache instead of
 * hydrating stale-shaped data into the new code.
 */
const CACHE_BUSTER = 'v1'
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Shared cache for the slices migrated to TanStack Query (templates and
// per-occurrence completions). The reducer-backed store still owns everything
// else; the two coexist. Lives in its own module so auth can clear it on
// sign-out.
export const queryClient = new QueryClient({
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
