import type { QueryClient } from '@tanstack/react-query'

/**
 * What an optimistic write records so it can be undone: every cache entry it
 * overwrote, paired with whatever was there before.
 *
 * A list rather than one entry, because a write can touch more than one cache:
 * pinning a to-do changes where to-dos appear as well as the lists themselves,
 * and one day can sit in several cached months at once.
 */
export type Rollback = { entries: [readonly unknown[], unknown][] }

/**
 * Put back whatever `onMutate` recorded.
 *
 * Safe to call with nothing. A write resumed after a restart never ran
 * `onMutate`, so there is nothing to undo — the saved cache already shows the
 * change, and the re-read on settle is what makes it true.
 */
export function rollback(queryClient: QueryClient, ctx: unknown): void {
  for (const [key, data] of (ctx as Rollback | undefined)?.entries ?? []) {
    if (data !== undefined) queryClient.setQueryData(key, data)
  }
}
