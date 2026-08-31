---
name: architecture-boundaries
description: Module boundaries and integration modules this Planner codebase has settled on, as established in the 2026-07-26 whole-tree review
metadata:
  type: project
---

Boundaries observed and treated as settled (do not re-litigate these in future reviews):

- **Two-slice ownership rule.** Every data slice has exactly one owner: the reducer +
  `ScheduleStore` path (`src/store/`, `src/state.tsx`) or TanStack Query (`src/data/`).
  Templates and per-occurrence completions have already been strangled off the reducer;
  events, lists, people, dependencies and listLinks have not. This is a deliberate,
  in-progress migration — do not flag the coexistence itself as a violation.
- **Integration modules.** `src/main.tsx` wires the Query client + persister and
  `AuthProvider`. `src/App.tsx` (`Root`) is the auth gate and mounts `AppProvider`.
  `src/state.tsx` is the reducer-slice integration point (store, dispatch, offline queue,
  realtime routing). There is no single composition root for the Query slices — they
  self-wire.
- **`src/lib/` is a mixed bag by convention**: pure domain logic (dates, recurrence,
  occurrences, conflicts, timing), React hooks (useLatest, useSearch, useSwipeGestures),
  and infrastructure singletons (supabase, queryClient). Only flag members of it when a
  specific module is misplaced, not the directory shape.
- **Swipe/gesture seam — OPEN, judgement reversed once, not settled.**
  `src/lib/useSwipeGestures.ts` owns the touch machine, `pageInert` and zoom persistence;
  `src/styles/shared.module.css` owns `swipeClip`/`swipeStrip`. DayView, WeekCalendar
  (`WeekListBody`), WeekTimeline and MonthView each declare their own `stripRef` and render
  their own `swipeClip` → `swipeStrip` → `pageInert` scaffolding around a three-page array.
  - *First reading (2026-07-26):* boundary violation — the hook owns the transform maths
    but the DOM contract it depends on lives in four copies it cannot see.
  - *Second reading (2026-07-27):* acceptable — roughly six lines of JSX per view, and each
    view scrolls differently, so a shared component would have to take the scroll container
    as a prop anyway.
  - The code did **not** change between these two readings (both at `edb9478`, clean tree);
    only the judgement did. The second reading was initially and wrongly recorded here as
    "no longer true". Neither reading is settled — decide it with the user, or re-derive it,
    before acting either way.
- **Recurrence is deliberately implemented twice**: `src/lib/recurrence.ts` +
  `src/lib/rrule.ts` (browser, uses the `rrule` package) and
  `supabase/functions/send-reminders/logic.ts` (Deno, hand-rolled parser). The runtimes
  cannot share a bundle; `src/lib/reminderSenderLogic.test.ts` cross-validates them.
  Do not flag this duplication.

**Why:** the app is a household planner mid-migration from a Phase-1 localStorage/reducer
design to Supabase + TanStack Query; several seams are transitional by design.

**How to apply:** when reviewing, judge new code against the slice-ownership rule and
against the open findings in [[architecture-open-findings]] rather than proposing a
different overall shape.
