---
name: architecture-boundaries
description: Settled module seams and integration modules in Planner, re-derived from code on 2026-09-06 after the calendar-view work on branch `views`
metadata:
  type: project
---

**Corrected 2026-09-06** (branch `views`, uncommitted). Two claims in the 2026-09-04
version were **stale because the code changed**, and are retired here:

- "`src/components/` still holds screens that orchestrate (`WeekCalendar`, `MonthView`,
  `Settings`, `AlertHost`)" — `WeekCalendar.tsx`, `WeekTimeline.tsx`, `MonthView.tsx`,
  `DayView.tsx`, `ViewHeader.tsx` are deleted (`git status` shows them staged `D`).
  Only `Settings` and `AlertHost` still orchestrate inside `src/components/`.
- "`routes/routes.tsx` says `/day` is the shape the rest move to" — all three calendar
  tabs are now routes (`routes.tsx:22-28`: `DayRoute`, `WeekRoute`, `MonthRoute`).
  `/settings` is the only unconverted screen, and its own comment says so.

The house rules live in `docs/ARCHITECTURE.md` (DRSp: Client / Domain / Route / Service /
Layout / Assets, ten invariants in §4). **Read it, do not restate it here.**
`docs/PATTERN_NOTES.md` is the user's working notes on where the pattern is known to be
wrong or unsettled — check it before reporting anything it already covers.

Integration modules (verified 2026-09-06):

- `src/main.tsx` — query client + persister, `SessionProvider` fed by `src/session.ts`.
- `src/session.ts` — the one place `client/auth` meets `services/session` (keeps R3 true).
- `src/domains/index.ts` — registers every domain's mutation defaults, owns
  `queryKeysForTable`, the table → query-key map the realtime service is fed.
- `src/App.tsx` — auth gate (`Root`) and `AppShell`; wires realtime, push, timezone write.
- `src/routes/routes.tsx` — the route table.
- **`src/views/Calendar.tsx` (new)** — the one place `services/gestures` is wired for the
  calendar. `CalendarView` owns `scrollRef`, `stripRef`, `useSwipeGestures` and
  `pageInert`; `DayRoute`, `WeekRoute` and `MonthRoute` compose it through slots and no
  longer touch the gesture service themselves (only `loadZoom`, for the initial value).

Verified holding on 2026-09-06, do not re-derive:

- **Invariant 1** — `database.types.ts` and `@supabase/supabase-js` named only under
  `src/client/`.
- **Invariant 3** — every `domains/` import inside `src/services/` is `import type`.
- **Invariant 5** — `src/assets/` imports nothing from `domains/`, `client/`, `services/`
  or `components/`. Re-checked including the new `assets/ui/{TimelineColumn,TimeGutter,
  DayHead}.tsx` and `assets/hooks/useNow.ts`. `TimelineColumn.tsx:5` redeclares
  `DAY_MIN` rather than importing it from `services/timeline-layout` — that is the rule
  working, not a defect. Do not flag it.
- **Domain components are props-only and take colour already resolved.** Verified across
  `domains/events/components/{AllDayChip,EventBlock,Badges}.tsx` and
  `domains/people/components/{LaneHead,Avatars}.tsx`: none imports a query or mutation,
  and each takes `color: ColorKey` rather than `people` + `overrides`. This is the shape
  `docs/PATTERN_NOTES.md` §2 asked for at the leaf.
- **Recurrence is deliberately implemented twice** (browser `services/recurrence` vs Deno
  `supabase/functions/send-reminders/logic.ts`); `src/client/reminderSenderLogic.test.ts`
  cross-validates. Do not flag.

Settled by the user, do not reopen:

- **The swipe deck belongs in a Layout that owns the gesture service.**
  `docs/PATTERN_NOTES.md` §1 argues this from measurement, against my first reading.
  The code now does it (`src/views/Calendar.tsx`). The only live question is that
  `ARCHITECTURE.md` §2's layer table has not been updated to permit it — that is a doc
  drift to report, not a code finding.

Deliberately transitional, stated in the code — flag only the specific cost, never the
shape itself:

- `src/types.ts` is a global re-export barrel kept "while the restructure runs".
- The visible date lives in `src/navigation.tsx` context, not the URL.

**How to apply:** judge new code against `docs/ARCHITECTURE.md` §4 and against
[[architecture-open-findings]]. Do not propose a different overall shape.
