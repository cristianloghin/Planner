import { useMutation } from '@tanstack/react-query'
import { ensureAccount } from '../auth'
import { supabase } from '../client/supabase'
import { occKey } from '../lib/occurrences'
import { queryClient } from '../lib/queryClient'
import { SupabaseStore } from '../store/supabaseStore'
import type { CalendarEvent, CompletionsMap, OccurrenceState, OccurrenceStatusCode } from '../types'

/**
 * Writing per-occurrence state (statuses, checklist ticks, timing overrides).
 *
 * The reads for this slice have moved to domains/occurrences; these writes are
 * what is left here, and they patch the cache that domain fills: one query per
 * calendar month, keyed ['completions', accountId, 'yyyy-mm']. Those windows
 * overlap on purpose (fetch margins), so a write patches EVERY cached one.
 *
 * Registered under ['occurrence-write']; the domain's equivalent writes are
 * registered under ['occurrences-write'] and take the account in their values.
 * Both are live until the writes move too — see docs/STATUS.md.
 */

// ---- mutations --------------------------------------------------------------
//
// One shared mutation identity with its behaviour registered as MUTATION
// DEFAULTS on the query client, not inline in the hooks. That is what makes
// offline writes durable: a mutation paused while offline is dehydrated by the
// cache persister (only paused ones are, by default), rehydrated on the next
// launch carrying just its key + variables, and resumed by
// resumePausedMutations() — at which point the runtime looks up the mutationFn
// by key from these defaults. The variables are fully serializable (the event
// object rides along) so a resumed write needs no other context.

/** All occurrence writes, as one serializable discriminated union. */
export type OccurrenceWrite =
  | { kind: 'status'; event: CalendarEvent; date: string; status: OccurrenceStatusCode | null }
  | { kind: 'tick'; event: CalendarEvent; date: string; entryId: string; checked: boolean }
  | { kind: 'override'; event: CalendarEvent; date: string; start: string; duration: number }
  | { kind: 'clearOverride'; event: CalendarEvent; date: string }
  | { kind: 'cancel'; event: CalendarEvent; date: string }

const OCCURRENCE_WRITE_KEY = ['occurrence-write'] as const
// Bare prefix (no accountId): defaults are registered at module scope, before
// any session exists. Only the signed-in account's queries are ever cached
// (sign-out clears the client), so the wider match is safe.
const ANY_COMPLETIONS = ['completions'] as const

/**
 * Resolve the store without hooks: a resumed mutation runs outside any
 * component. Session and account come from supabase directly; `ensureAccount`
 * caches in-flight lookups, so this is cheap after the first call.
 */
async function resolveWriteStore(): Promise<SupabaseStore> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Occurrence write: not signed in')
  const accountId = await ensureAccount(userId)
  return new SupabaseStore(accountId, userId)
}

/** The optimistic patch for a write — mirrors the server semantics. An entry
 *  patched to empty is dropped, matching the load-side "skip rows that carry
 *  no app-visible state". */
function patchEntry(entry: OccurrenceState | undefined, w: OccurrenceWrite): OccurrenceState {
  switch (w.kind) {
    case 'status': {
      const { status: _drop, ...rest } = entry ?? {}
      return w.status ? { ...rest, status: w.status } : rest
    }
    case 'tick':
      return { ...entry, checked: { ...(entry?.checked ?? {}), [w.entryId]: w.checked } }
    case 'override':
      return { ...entry, start: w.start, duration: w.duration }
    case 'clearOverride': {
      const { start: _s, duration: _d, ...rest } = entry ?? {}
      return rest
    }
    case 'cancel':
      return { ...entry, cancelled: true }
  }
}

queryClient.setMutationDefaults(OCCURRENCE_WRITE_KEY, {
  mutationFn: async (w: OccurrenceWrite) => {
    const store = await resolveWriteStore()
    switch (w.kind) {
      case 'status':
        return store.setOccurrenceStatus(w.event, w.date, w.status)
      case 'tick':
        return store.setChecklistEntry(w.event, w.date, w.entryId, w.checked)
      case 'override':
        return store.setOccurrenceOverride(w.event, w.date, w.start, w.duration)
      case 'clearOverride':
        return store.clearOccurrenceOverride(w.event, w.date)
      case 'cancel':
        return store.cancelOccurrence(w.event, w.date)
    }
  },
  // Patch the occurrence's entry in EVERY cached month window (they overlap
  // via fetch margins), snapshot for rollback, re-sync on settle. A mutation
  // resumed after a restart has no ctx to roll back — the persisted cache
  // already carries its optimistic patch, and onSettled reconciles.
  onMutate: async (w: OccurrenceWrite) => {
    await queryClient.cancelQueries({ queryKey: ANY_COMPLETIONS })
    const prev = queryClient.getQueriesData<CompletionsMap>({ queryKey: ANY_COMPLETIONS })
    const k = occKey(w.event.id, w.date)
    queryClient.setQueriesData<CompletionsMap>({ queryKey: ANY_COMPLETIONS }, (map) => {
      if (!map) return map
      const next = { ...map }
      const patched = patchEntry(map[k], w)
      if (Object.keys(patched).length) next[k] = patched
      else delete next[k]
      return next
    })
    return { prev }
  },
  onError: (_err, _w, ctx) => {
    const prev = (ctx as { prev?: [readonly unknown[], CompletionsMap | undefined][] } | undefined)
      ?.prev
    for (const [key, data] of prev ?? []) queryClient.setQueryData(key as readonly unknown[], data)
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: ANY_COMPLETIONS })
  },
})

function useOccurrenceWrite() {
  return useMutation<void, Error, OccurrenceWrite>({ mutationKey: [...OCCURRENCE_WRITE_KEY] })
}

/** Set (or clear, with status: null) an occurrence's explicit status. */
export function useSetOccurrenceStatus() {
  const m = useOccurrenceWrite()
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; status: OccurrenceStatusCode | null }) =>
      m.mutate({ kind: 'status', ...v }),
  }
}

/** Set one checklist entry's tick for an occurrence to an explicit value. */
export function useSetChecklistEntry() {
  const m = useOccurrenceWrite()
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; entryId: string; checked: boolean }) =>
      m.mutate({ kind: 'tick', ...v }),
  }
}

/** One-off timing override for a single occurrence (reschedule). */
export function useSetOccurrenceOverride() {
  const m = useOccurrenceWrite()
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; start: string; duration: number }) =>
      m.mutate({ kind: 'override', ...v }),
  }
}

/** Drop an occurrence's timing override, keeping its status/ticks. */
export function useClearOccurrenceOverride() {
  const m = useOccurrenceWrite()
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string }) =>
      m.mutate({ kind: 'clearOverride', ...v }),
  }
}

/** Remove one occurrence from its series, leaving the rest of the series alone. */
export function useCancelOccurrence() {
  const m = useOccurrenceWrite()
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string }) => m.mutate({ kind: 'cancel', ...v }),
  }
}
