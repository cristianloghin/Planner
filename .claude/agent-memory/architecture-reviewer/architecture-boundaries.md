---
name: architecture-boundaries
description: Settled module seams and integration modules in Planner, re-derived from code on 2026-09-06 after the URL-carries-the-date and editor-as-a-route work on branch `views`
metadata:
  type: project
---

**Re-derived 2026-09-06** against `views` @ `edc5f42`. Corrections to the earlier
version of this note are marked; in each case the code changed.

The house rules live in `docs/ARCHITECTURE.md` (DRSp: Client / Domain / Route / Service /
Layout / Assets, **eleven** invariants in §4 — 10 URL carries identity, 11 routes never
style). **Read it, do not restate it here.** `docs/PATTERN_NOTES.md` is the user's working
notes; its §1, §2 and §5 are now folded into ARCHITECTURE §2/§6/§11 and marked settled —
§4, §6, §7 are still open questions there. Check it before reporting anything it covers.

Integration modules (verified 2026-09-06):

- `src/main.tsx` — query client + persister, `SessionProvider` fed by `src/session.ts`.
- `src/session.ts` — the one place `client/auth` meets `services/session`.
- `src/domains/index.ts` — registers mutation defaults, owns `queryKeysForTable`.
- `src/App.tsx` — auth gate (`Root`) and `AppShell`; realtime, push, timezone write,
  sync banners, and (new) `TabBar` + `useVisibleDate`, the date the tabs carry across
  `/day`, `/week`, `/month`.
- `src/routes/routes.tsx` — the route table **and the URL vocabulary**: each calendar
  route's guard normalises its param (bad date → today, mid-week → Monday, mid-month →
  first). `/` redirects to today because the PWA `start_url` is the bare base.
- `src/views/Calendar.tsx` — the one place `services/gestures` is wired for the calendar;
  owns the deck refs, `useSwipeGestures`, `pageInert`, and publishes `--lane-columns`.
- `src/routes/EventRoute.tsx` — **currently** also the owner of the `/event` URL contract
  (`newEventPath`, `editEventPath`), which `DayRoute` and `WeekRoute` import. Reported as
  a finding 2026-09-06; not a settled boundary.

Verified holding on 2026-09-06, do not re-derive:

- **Invariant 1** — `database.types.ts` and `@supabase/supabase-js` named only under `src/client/`.
- **Invariant 3** — every `domains/` import inside `src/services/` is `import type`.
- **Invariant 5** — `src/assets/` imports nothing from `domains/`, `client/`, `services/`,
  `components/`. `Timeline.tsx:7` redeclares `DAY_MIN` rather than importing it from
  `services/timeline-layout` — that is the rule working, not a defect. Do not flag.
- **Invariant 11** — `grep -rn "module.css\|className\|style=" src/routes/` returns nothing.
- **Invariant 10** — the visible date is in the URL (`/day/:date`, `/week/:weekStart`,
  `/month/:month`). What stays in route state is zoom, the expanded lane/day, and the
  occurrence sheet — all sanctioned by ARCHITECTURE §2 "which state a route holds".
- **Views export one thing each** — `CalendarView`, `TimelineView`, `MonthGridView`;
  slot components stay private (§11 Views).
- **Head/body column agreement is published once** — `Calendar.tsx:175` sets
  `--lane-columns`; `Timeline.module.css:6` and `MonthGrid.module.css:3` read it from CSS.
  *(Corrects the earlier "wired in three places" note — `DayPage.tsx`/`WeekPage.tsx` are
  deleted.)*
- **Colour is resolved once per route** — `personColorMap` at `DayRoute.tsx:149`,
  `WeekRoute.tsx:139`, `MonthRoute.tsx:46`; leaves take a `ColorKey`.
  *(Corrects the earlier "the colour join moved up rather than away".)*
- **Recurrence is deliberately implemented twice** (browser vs Deno function);
  `src/client/reminderSenderLogic.test.ts` cross-validates. Do not flag.

Settled by the user, do not reopen:

- **The swipe deck belongs in a Layout that owns the gesture service** — argued from
  measurement in `docs/PATTERN_NOTES.md` §1, against my first reading. The doc drift I
  reported on 2026-09-06 is now gone: ARCHITECTURE §2's table grants Layout "Assets, and
  Services that produce interaction rather than data", and §11 names `views/` as the
  Layout layer.
- **Wiring may be duplicated between routes** (the same five hooks, the same sheet
  trailer); structure may not (ARCHITECTURE §2, Route). Do not report the repeated
  `useEvents/usePeople/usePreferences/useCompletionsForRange` or the repeated
  `OccurrenceSheet` block in `DayRoute`/`WeekRoute` as duplication.
- **The occurrence sheet stays route-local state while the editor is a route** — stated
  in `routes/routes.tsx:23-25`.

Deliberately transitional, stated in the code — flag only the specific cost, never the
shape itself:

- `src/types.ts` is a global re-export barrel kept "while the restructure runs".
- `src/components/` still holds `Settings` (its own comment says so), `EventEditor`,
  `OccurrenceSheet`, `EventSearch`, `AttendeeChips`, `TemplateEditor`, and the shell
  pieces `AlertHost`/`Login`/`SyncBanners`/`UpdatePrompt`.

**How to apply:** judge new code against `docs/ARCHITECTURE.md` §4 and against
[[architecture-open-findings]]. Do not propose a different overall shape.
