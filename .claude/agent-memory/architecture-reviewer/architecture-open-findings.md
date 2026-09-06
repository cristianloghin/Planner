---
name: architecture-open-findings
description: Open structural findings for Planner with dispositions, updated 2026-09-06 from the `views` branch review; verify against code before restating
metadata:
  type: project
---

**Updated 2026-09-06** (branch `views`, uncommitted calendar-view work). Each carried
finding below names its disposition. Nothing here was retired on a change of judgement.

## Carried from the 2026-09-04 review

1. **Leaf components fetching** — *partially acted on, code changed.* `Avatars` was
   rewritten as `domains/people/components/Avatars.tsx`, props-only, taking
   `{person, color}[]`; the old `src/components/Avatars.tsx` is deleted. **Still open
   for `AttendeeChips`**: `src/components/AttendeeChips.tsx:20-22` calls `usePeople` +
   `usePreferences` inside `EventEditor`, which already holds both at
   `EventEditor.tsx:145-146`.
2. **Day-override rules split across components** — *unknown; not re-derived in depth.*
   Both writers now exist (`EventEditor.tsx:351`, `OccurrenceSheet.tsx:205`), so the
   divergence may have closed; the read-through duplication was not re-checked. Outside
   the `views` diff.
3. **`domains/occurrences/selectors.ts` is dead** — *not acted on, still true.*
   `stateFor` (:19) and `isCancelled` (:25) have zero callers including tests.
4. **The calendar's position is not in the URL (invariant 10)** — *not acted on, and now
   worse.* `DayRoute.tsx:73` and `WeekRoute.tsx:54` read `useCalendarNavigation()`;
   `MonthRoute.tsx:52` keeps its own `useState` cursor instead. Two sources of truth for
   "where the calendar is looking", none of them the URL.
5. **The occurrence key format is written twice** — *not acted on, still true.*
   `domains/occurrences/transformers.ts:11` (`occurrenceKey`) and
   `services/recurrence/timing.ts` (`occKey`); `OccurrenceSheet.tsx:62` uses the
   service's copy.

## Reported 2026-09-06 (branch `views`), disposition unknown

6. **The colour join moved up rather than away.** Leaf components were fixed (see
   boundaries note), but `DayPage.tsx:31`, `WeekPage.tsx:33` and `MonthRoute.tsx:131-133`
   take `people: Person[]` + `overrides` purely to call `eventColorKey`/`personColorKey`
   at render time — 8 call sites across 5 modules. `docs/PATTERN_NOTES.md` §2 measured
   this on 2 components and concluded one resolved colour per lane is enough.
7. **`ARCHITECTURE.md` §2's layer table contradicts `views/Calendar.tsx`.** The table
   gives Layout "May import: Assets" and calls it presentational only; the file imports
   values from `services/gestures` because PATTERN_NOTES §1 says it should. Also
   `views/` is not a layer name under §11 "folders are layers". Doc-side fix.
8. **The lane grid template is wired in three places** — `Calendar.tsx:88` (head, from
   slot weights), `DayPage.tsx:45` and `WeekPage.tsx:62` (body, from a `weights` prop).
   Head/body alignment holds only because each route passes the same array twice.
9. **Dead code left by the deletions.** `assets/hooks/useMediaQuery.ts` (zero refs);
   seven now-unreferenced classes in `assets/styles/shared.module.css` (`.headSide:41`,
   `.todayBtn:48`, `.todayActive:59`, `.swipeBody:79`, `.swipeStrip:86`, `.swipeClip:95`,
   `.empty:122`), five more with only `Settings.tsx:43-53` left as consumer; and the
   week-layout preference (`Settings.tsx:24-27,137-147` writes it, no screen reads it).

**Coverage gap, unchanged and acknowledged in `docs/ARCHITECTURE.md` §11 Enforcement:**
Biome 1.9.4 only. No dead-export detection, no cycle detection, no import-boundary
enforcement, nothing structural in `.github/workflows/`. Findings 3 and 9 were found by
hand. The doc's own pick is `dependency-cruiser`; a dead-export tool (knip) would cover 9.

**How to apply:** verify each against the code before restating. See
[[architecture-boundaries]] for what is settled or transitional by declaration.
