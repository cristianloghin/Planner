import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { addDays } from "../lib/dates";
import { occKey } from "../lib/occurrences";
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

interface OccurrenceVars {
  event: CalendarEvent;
  date: string;
}

/**
 * Shared optimistic plumbing: patch the occurrence's entry in EVERY cached
 * month window (they overlap via margins), roll back on error, re-sync on
 * settle. An entry patched to empty is dropped, mirroring the load-side "skip
 * rows that carry no app-visible state".
 */
function useOccurrenceMutation<V extends OccurrenceVars>(
  run: (store: SupabaseStore, vars: V) => Promise<void>,
  patch: (entry: OccurrenceState | undefined, vars: V) => OccurrenceState,
) {
  const { accountId } = useAuth();
  const store = useCompletionsStore();
  const qc = useQueryClient();
  const prefix = completionsPrefix(accountId);

  return useMutation({
    mutationFn: (vars: V) => {
      if (!store) throw new Error("Completions: not signed in yet");
      return run(store, vars);
    },
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: prefix });
      const prev = qc.getQueriesData<CompletionsMap>({ queryKey: prefix });
      const k = occKey(vars.event.id, vars.date);
      qc.setQueriesData<CompletionsMap>({ queryKey: prefix }, (map) => {
        if (!map) return map;
        const next = { ...map };
        const patched = patch(map[k], vars);
        if (Object.keys(patched).length) next[k] = patched;
        else delete next[k];
        return next;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: prefix });
    },
  });
}

/** Set (or clear, with status: null) an occurrence's explicit status. */
export function useSetOccurrenceStatus() {
  return useOccurrenceMutation<OccurrenceVars & { status: OccurrenceStatusCode | null }>(
    (store, v) => store.setOccurrenceStatus(v.event, v.date, v.status),
    (entry, v) => {
      const { status: _drop, ...rest } = entry ?? {};
      return v.status ? { ...rest, status: v.status } : rest;
    },
  );
}

/** Set one checklist entry's tick for an occurrence to an explicit value. */
export function useSetChecklistEntry() {
  return useOccurrenceMutation<OccurrenceVars & { entryId: string; checked: boolean }>(
    (store, v) => store.setChecklistEntry(v.event, v.date, v.entryId, v.checked),
    (entry, v) => ({
      ...entry,
      checked: { ...(entry?.checked ?? {}), [v.entryId]: v.checked },
    }),
  );
}

/** One-off timing override for a single occurrence (reschedule). */
export function useSetOccurrenceOverride() {
  return useOccurrenceMutation<OccurrenceVars & { start: string; duration: number }>(
    (store, v) => store.setOccurrenceOverride(v.event, v.date, v.start, v.duration),
    (entry, v) => ({ ...entry, start: v.start, duration: v.duration }),
  );
}

/** Drop an occurrence's timing override, keeping its status/ticks. */
export function useClearOccurrenceOverride() {
  return useOccurrenceMutation<OccurrenceVars>(
    (store, v) => store.clearOccurrenceOverride(v.event, v.date),
    (entry) => {
      const { start: _s, duration: _d, ...rest } = entry ?? {};
      return rest;
    },
  );
}
