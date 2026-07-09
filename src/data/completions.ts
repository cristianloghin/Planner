import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ensureAccount, useAuth } from "../auth";
import { addDays } from "../lib/dates";
import { occKey } from "../lib/occurrences";
import { queryClient } from "../lib/queryClient";
import { supabase } from "../lib/supabase";
import { SupabaseStore } from "../store/supabaseStore";
import type {
  CalendarEvent,
  CompletionsMap,
  OccurrenceState,
  OccurrenceStatusCode,
} from "../types";

/**
 * Per-occurrence state (statuses, checklist ticks, timing overrides) on
 * TanStack Query — the second slice off the reducer, after templates. Unlike
 * templates it is fetched per WINDOW: these tables grow with every tick ever
 * made, so views load only the calendar month(s) they render (plus margins),
 * keeping startup and reload cost constant as the account ages.
 *
 * Cache shape: one query per calendar month, keyed ['completions', accountId,
 * 'yyyy-mm'], each holding a CompletionsMap for that month's fetch window.
 * Windows overlap on purpose (margins), so a mutation patches EVERY cached
 * window via setQueriesData. Realtime changes to the two backing tables
 * invalidate the whole prefix (routed in state.tsx).
 */

const STALE_MS = 5 * 60_000;

export const completionsPrefix = (accountId: string | null | undefined) =>
  ["completions", accountId] as const;
const completionsKey = (accountId: string | null | undefined, month: string) =>
  ["completions", accountId, month] as const;

// A month window is fetched with margins: back, so a multi-day occurrence
// STARTING before the month still renders inside it (its override row lives on
// its start date); forward, so the month-grid's trailing cells are covered.
// Reschedules from farther away are caught by the rescheduled_to range in
// loadCompletionsRange, not by these margins.
const BACK_MARGIN_DAYS = 31;
const FWD_MARGIN_DAYS = 7;

const monthOf = (date: string) => date.slice(0, 7);
const monthStart = (month: string) => `${month}-01`;

function shiftMonth(month: string, delta: 1 | -1): string {
  const [y, m] = month.split("-").map(Number);
  const n = m + delta;
  if (n === 0) return `${y - 1}-12`;
  if (n === 13) return `${y + 1}-01`;
  return `${y}-${String(n).padStart(2, "0")}`;
}

function fetchBounds(month: string): { from: string; to: string } {
  return {
    from: addDays(monthStart(month), -BACK_MARGIN_DAYS),
    to: addDays(monthStart(shiftMonth(month, 1)), FWD_MARGIN_DAYS),
  };
}

/** The months whose windows cover [from, to] plus any extra dates. */
function monthsFor(from: string, to: string, extraDates: string[]): string[] {
  const months = new Set<string>();
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) months.add(m);
  for (const d of extraDates) months.add(monthOf(d));
  return [...months].sort();
}

/** A store bound to the current account/user, or null until authed. */
function useCompletionsStore(): SupabaseStore | null {
  const { accountId, session } = useAuth();
  const userId = session?.user.id ?? null;
  return useMemo(
    () => (accountId && userId ? new SupabaseStore(accountId, userId) : null),
    [accountId, userId],
  );
}

/** Merge month maps into one object, keeping identity stable while the
 *  underlying query data references are unchanged (so downstream useMemos —
 *  recurrence expansion — don't recompute on every render). */
function useStableMerge(parts: (CompletionsMap | undefined)[]): CompletionsMap {
  const ref = useRef<{ parts: (CompletionsMap | undefined)[]; merged: CompletionsMap }>();
  if (
    !ref.current ||
    ref.current.parts.length !== parts.length ||
    parts.some((p, i) => p !== ref.current!.parts[i])
  ) {
    ref.current = { parts, merged: Object.assign({}, ...parts.filter(Boolean)) };
  }
  return ref.current.merged;
}

/**
 * Per-occurrence state covering the inclusive [from, to] date range, plus any
 * `extraDates` (e.g. prerequisite occurrence dates referenced from inside the
 * range — see prerequisiteDatesInRange). Pass from = null to fetch nothing.
 * The months adjacent to the range are prefetched, so swiping across a month
 * boundary hits a warm cache.
 */
export function useCompletionsForRange(
  from: string | null,
  to?: string | null,
  extraDates: string[] = [],
): { completions: CompletionsMap; isLoading: boolean } {
  const { accountId } = useAuth();
  const store = useCompletionsStore();
  const qc = useQueryClient();

  const extraKey = extraDates.join(",");
  const months = useMemo(
    () => (from ? monthsFor(from, to ?? from, extraKey ? extraKey.split(",") : []) : []),
    [from, to, extraKey],
  );

  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: completionsKey(accountId, month),
      queryFn: () => {
        const b = fetchBounds(month);
        return store!.loadCompletionsRange(b.from, b.to);
      },
      enabled: !!store,
      staleTime: STALE_MS,
    })),
  });

  // Warm the neighbouring months so day/week swipes across a boundary don't
  // hit a cold cache.
  const monthsKey = months.join(",");
  useEffect(() => {
    if (!store || !months.length) return;
    for (const m of [shiftMonth(months[0], -1), shiftMonth(months[months.length - 1], 1)]) {
      void qc.prefetchQuery({
        queryKey: completionsKey(accountId, m),
        queryFn: () => {
          const b = fetchBounds(m);
          return store.loadCompletionsRange(b.from, b.to);
        },
        staleTime: STALE_MS,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, store, qc, monthsKey]);

  const completions = useStableMerge(results.map((r) => r.data));
  return {
    completions,
    // A paused fetch (offline, no cached window) is not "loading" — nothing is
    // coming until connectivity returns, and the offline banner tells that
    // story. Holding a loader for it would wedge the UI.
    isLoading: results.some((r) => r.isPending && r.fetchStatus === "fetching"),
  };
}

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
  | { kind: "status"; event: CalendarEvent; date: string; status: OccurrenceStatusCode | null }
  | { kind: "tick"; event: CalendarEvent; date: string; entryId: string; checked: boolean }
  | { kind: "override"; event: CalendarEvent; date: string; start: string; duration: number }
  | { kind: "clearOverride"; event: CalendarEvent; date: string };

const OCCURRENCE_WRITE_KEY = ["occurrence-write"] as const;
// Bare prefix (no accountId): defaults are registered at module scope, before
// any session exists. Only the signed-in account's queries are ever cached
// (sign-out clears the client), so the wider match is safe.
const ANY_COMPLETIONS = ["completions"] as const;

/**
 * Resolve the store without hooks: a resumed mutation runs outside any
 * component. Session and account come from supabase directly; `ensureAccount`
 * caches in-flight lookups, so this is cheap after the first call.
 */
async function resolveWriteStore(): Promise<SupabaseStore> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Occurrence write: not signed in");
  const accountId = await ensureAccount(userId);
  return new SupabaseStore(accountId, userId);
}

/** The optimistic patch for a write — mirrors the server semantics. An entry
 *  patched to empty is dropped, matching the load-side "skip rows that carry
 *  no app-visible state". */
function patchEntry(entry: OccurrenceState | undefined, w: OccurrenceWrite): OccurrenceState {
  switch (w.kind) {
    case "status": {
      const { status: _drop, ...rest } = entry ?? {};
      return w.status ? { ...rest, status: w.status } : rest;
    }
    case "tick":
      return { ...entry, checked: { ...(entry?.checked ?? {}), [w.entryId]: w.checked } };
    case "override":
      return { ...entry, start: w.start, duration: w.duration };
    case "clearOverride": {
      const { start: _s, duration: _d, ...rest } = entry ?? {};
      return rest;
    }
  }
}

queryClient.setMutationDefaults(OCCURRENCE_WRITE_KEY, {
  mutationFn: async (w: OccurrenceWrite) => {
    const store = await resolveWriteStore();
    switch (w.kind) {
      case "status":
        return store.setOccurrenceStatus(w.event, w.date, w.status);
      case "tick":
        return store.setChecklistEntry(w.event, w.date, w.entryId, w.checked);
      case "override":
        return store.setOccurrenceOverride(w.event, w.date, w.start, w.duration);
      case "clearOverride":
        return store.clearOccurrenceOverride(w.event, w.date);
    }
  },
  // Patch the occurrence's entry in EVERY cached month window (they overlap
  // via fetch margins), snapshot for rollback, re-sync on settle. A mutation
  // resumed after a restart has no ctx to roll back — the persisted cache
  // already carries its optimistic patch, and onSettled reconciles.
  onMutate: async (w: OccurrenceWrite) => {
    await queryClient.cancelQueries({ queryKey: ANY_COMPLETIONS });
    const prev = queryClient.getQueriesData<CompletionsMap>({ queryKey: ANY_COMPLETIONS });
    const k = occKey(w.event.id, w.date);
    queryClient.setQueriesData<CompletionsMap>({ queryKey: ANY_COMPLETIONS }, (map) => {
      if (!map) return map;
      const next = { ...map };
      const patched = patchEntry(map[k], w);
      if (Object.keys(patched).length) next[k] = patched;
      else delete next[k];
      return next;
    });
    return { prev };
  },
  onError: (_err, _w, ctx) => {
    const prev = (ctx as { prev?: [readonly unknown[], CompletionsMap | undefined][] } | undefined)?.prev;
    for (const [key, data] of prev ?? []) queryClient.setQueryData(key as readonly unknown[], data);
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: ANY_COMPLETIONS });
  },
});

function useOccurrenceWrite() {
  return useMutation<void, Error, OccurrenceWrite>({ mutationKey: [...OCCURRENCE_WRITE_KEY] });
}

/** Set (or clear, with status: null) an occurrence's explicit status. */
export function useSetOccurrenceStatus() {
  const m = useOccurrenceWrite();
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; status: OccurrenceStatusCode | null }) =>
      m.mutate({ kind: "status", ...v }),
  };
}

/** Set one checklist entry's tick for an occurrence to an explicit value. */
export function useSetChecklistEntry() {
  const m = useOccurrenceWrite();
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; entryId: string; checked: boolean }) =>
      m.mutate({ kind: "tick", ...v }),
  };
}

/** One-off timing override for a single occurrence (reschedule). */
export function useSetOccurrenceOverride() {
  const m = useOccurrenceWrite();
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string; start: string; duration: number }) =>
      m.mutate({ kind: "override", ...v }),
  };
}

/** Drop an occurrence's timing override, keeping its status/ticks. */
export function useClearOccurrenceOverride() {
  const m = useOccurrenceWrite();
  return {
    ...m,
    mutate: (v: { event: CalendarEvent; date: string }) =>
      m.mutate({ kind: "clearOverride", ...v }),
  };
}
