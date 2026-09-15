---
name: architecture-open-findings
description: Open structural findings for Planner with dispositions, updated 2026-09-06 after the routes review on branch `views` (ba2515b, edc5f42); verify against code before restating
metadata:
  type: project
---

**Updated 2026-09-06** after reviewing `4dae750~1..HEAD` on branch `views`. Each finding
names its disposition. Retirements below are code changes, not changes of judgement.

## Retired — the code changed

- **"The calendar's position is not in the URL (invariant 10)"** — closed by `ba2515b`.
  `src/navigation.tsx` and `navigation.test.ts` are deleted; `routes.tsx:34-53` declares
  `/day/:date`, `/week/:weekStart`, `/month/:month` with normalising guards;
  `MonthRoute.tsx:38` reads `useParams` where it held a `useState` cursor.
- **"`ARCHITECTURE.md` §2's layer table contradicts `views/Calendar.tsx`"** — closed by
  the doc update in `ba2515b`: the Layout row now reads "(`views/`) … Assets, and Services
  that produce interaction rather than data", and §11 lists `views/` as the Layout layer.
- **"The lane grid template is wired in three places"** — closed by `4dae750`:
  `Calendar.tsx:175` publishes `--lane-columns`, `Timeline.module.css:6` reads it,
  `DayPage.tsx`/`WeekPage.tsx` are gone.
- **"`domains/occurrences/selectors.ts` is dead"** — the file is deleted.
- **"Dead code left by the deletions"** (partly) — `assets/hooks/useMediaQuery.ts` is
  deleted and every remaining class in `assets/styles/shared.module.css` has at least one
  consumer (re-scanned by hand 2026-09-06).
- **"The colour join moved up rather than away"** — routes now call `personColorMap` once
  and pass resolved `ColorKey`s; `DayPage`/`WeekPage` are gone and `MonthPage` takes the
  resolved `colors` map.

## Open

1. **`EventEditor` orchestrates from `src/components/`.** *Reported 2026-09-06,
   disposition unknown.* `components/EventEditor.tsx` is 577 lines calling 7 domain hooks
   (`:112-113`, `:144-149`); `routes/EventRoute.tsx` is a ~20-line adapter that already
   re-reads `usePeople` (`:61`) the editor reads again (`:145`). Invariant 6 / §2 "thin
   shells over props-only views".
2. **The `/event` URL contract lives in a route component module.** *Reported 2026-09-06.*
   `EventRoute.tsx` exports `newEventPath` (:28) and `editEventPath` (:44) alongside its
   two route components; `DayRoute.tsx:33` and `WeekRoute.tsx:39` import them, an edge
   §2's table does not grant, and pull the editor's module graph with them. Moving them
   into `routes.tsx` would cycle (it imports the route components), so a sibling module is
   the fix.
3. **The week/month URL normalisation is written twice.** *Reported 2026-09-06.*
   `routes.tsx:41-43,49-51` (guards) and `App.tsx:54,60` (tab links). Verified in the
   router source that a guard redirect reuses the original `replace` flag (one history
   entry) and that `Link`'s active class matches the *pattern*, not the params — so the
   links do not need to normalise.
4. **The tap-to-create rule is duplicated.** *Reported 2026-09-06.* `DayRoute.tsx:129-142`
   and `WeekRoute.tsx:119-132` are the same snap-to-15 / one-hour / clamp-to-day rule;
   `SNAP = 15` is declared at `DayRoute.tsx:37`, `WeekRoute.tsx:45` and (for a different
   job) `EventEditor.tsx:36`.
5. **`AttendeeChips` fetches.** *Carried, not acted on.* `components/AttendeeChips.tsx:20-22`
   calls `usePeople` + `usePreferences` inside `EventEditor`, which holds both at `:145-146`.
6. **The occurrence key format is written twice.** *Carried, not acted on.*
   `domains/occurrences/transformers.ts:11` and `services/recurrence/timing.ts:21`;
   `OccurrenceSheet.tsx:62` uses the service's copy. `timing.ts:16` documents the choice.
7. **The week-layout preference has no consumer.** *Carried, not acted on.*
   `Settings.tsx:121,141` read and write it; no calendar screen renders differently.
8. **Two dead exports in `assets/utils/dates.ts`** — `dayLabel` (:48), `timeToMinutes`
   (:122), zero references including tests. *Reported 2026-09-06.*
9. **Day-override rules split across components** — *unknown, not re-derived.* Both writers
   exist (`EventEditor.tsx`, `OccurrenceSheet.tsx`); the read-through duplication was never
   re-checked. Re-derive before restating.

**Coverage gap, unchanged and acknowledged in `docs/ARCHITECTURE.md` §11 Enforcement:**
Biome 1.9.4 only; `.github/workflows/` has `deploy.yml` and `test.yml` and nothing
structural. No dead-export, cycle or import-boundary tool. Findings 8 and the retired
dead-code items were found by hand. The doc's own pick is `dependency-cruiser`; knip would
cover dead exports.

**How to apply:** verify each against the code before restating. See
[[architecture-boundaries]] for what is settled or transitional by declaration.
