---
name: architecture-open-findings
description: Structural findings for Planner with disposition per item, last re-derived from code 2026-07-27; verify before restating
metadata:
  type: project
---

Findings re-derived from the whole `src/` tree on 2026-07-27 (previous pass 2026-07-26).
Disposition for all items is **unknown** — nothing has been acted on or explicitly
accepted, so none of these is a boundary. Re-verify against code before restating.

Currently open (files as of 2026-07-27):

1. `src/store/supabaseStore.ts` (1239 lines) — one class owns row mapping for nine
   tables, the 24-case `apply` write switch, the Query-owned completions + templates
   reads/writes, a one-time legacy-list localStorage import, and the account-wide
   realtime channel. `ScheduleStore` declares 3 methods; the class exposes 11.
   `SupabaseStore` is constructed in three places (`store.ts` `createStore`,
   `data/useAccountStore.ts`, `data/completions.ts` `resolveWriteStore`).
   Recommended: move `loadCompletionsRange` + the four occurrence write methods out
   as free functions in `src/data/` (verified: they use only module-level helpers and
   `accountId`, sharing nothing with the event write path).
2. `src/store/store.ts` — `LocalStorageStore`, `normalizeLists`, `createStore` and the
   `ScheduleStore` interface are unreachable/single-implementation; `Root` gates
   `AppProvider` on `accountId && session`, so `createStore()`'s no-arg branch is dead
   and no test imports it. Recommended: delete all but `defaultState()`.
3. `src/state.tsx` — routes `event_occurrence` / `occurrence_item_state` realtime
   changes to a completions cache invalidation, while `data/templates.ts` owns its own
   realtime channel. Recommended: move the completions routing into
   `data/completions.ts`.
4. `src/components/Lists.tsx` (714 lines) — `patchTitle` / `addWorkingItem` /
   `patchItem` / `removeWorkingItem` each fork `if (draft) <local mutation> else
   dispatch(...)`, giving list-item semantics a second implementation alongside
   `store/reducer.ts`. Recommended: fold the draft over the exported `reducer`.
5. `src/lib/search.ts` — Supabase RPC data access in `lib/`; `EventSearch` and
   `ListSearch` thread `accountId` from `useAuth` into it. Recommended: move to
   `src/data/search.ts`.

Closed / no longer holds:

- (2026-07-26 item 4) "Swipe-strip scaffolding duplicated across DayView, WeekCalendar,
  WeekTimeline, MonthView" — **re-verified false on 2026-07-27**. The gesture machine,
  `pageInert` and the `swipeClip`/`swipeStrip` classes are centralised in
  `src/lib/useSwipeGestures.ts` + `src/styles/shared.module.css`; each view now holds
  only ~6 lines of strip JSX. Do not restate.

**Why:** so a later review does not re-derive the same list from scratch, and does not
repeat a finding the code has already resolved.

**How to apply:** verify each still holds before restating. See
[[architecture-boundaries]] for what is deliberately transitional.

**Invocation log.** 2026-07-27, third invocation at `edb9478`: all three review targets
(branch-vs-main, merge-base diff, uncommitted work) were empty — `main` is level with
`origin/main` and the tree holds only untracked `.claude/` agent files. No review was
produced and nothing above was re-derived. A further invocation at this commit will also
be empty; ask the user to name a target or land a change first.
