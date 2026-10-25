# Routines — implementation plan

How [`ROUTINES.md`](./ROUTINES.md) gets built, step by step. The design says
*what*; this says *in what order, in which files, and how each step is known
to be done*. When every step has landed, this file moves to `archive/` and the
design's status line changes.

One pull request per step. Each step leaves `main` deployable: the app on
`main` never references a table or column its migrations have not created,
and `deploy.yml` runs `supabase db push` before the build, so a merge is
enough to apply a migration ahead of the code that needs it.

**Every step:**

- Follows the layer rules in [`ARCHITECTURE.md`](./ARCHITECTURE.md): no React
  in `client/`, no Supabase outside it, writes as change objects, pure patches
  and selectors, screens compose views.
- Passes `npm test`, `npm run lint` and `npm run typecheck` before the PR.
- Click-tests anything that touches `client/` against the local stack
  (`supabase start`, `dev@planner.test`). Unit tests do not cover a round trip
  (DEV.md §6).
- Runs the architecture reviewer agent (`.claude/agents/architecture-reviewer.md`)
  on the diff before merging.

---

## Step 1 — the schema

**PR:** `0027_routines.sql`, regenerated types, seed.

**Migration.** Exactly the SQL in the design's *Tables* section:

1. `routine`, `routine_goal`, `routine_log`, with their checks and indexes.
2. `owns_routine(uuid)` — `security definer`, `set search_path = public`,
   `revoke all … from public`, `grant execute … to authenticated`, as `0024`
   does for `split_series`.
3. The three `for all to authenticated` policies.
4. `alter table … replica identity full` and
   `alter publication supabase_realtime add table …` for all three.

Table privileges come from `0004`'s default privileges; nothing to grant.

**Types.** With the local stack up and reset:

```bash
supabase db reset
npm run gen:types
```

Commit `src/client/database.types.ts`. The diff should add the three tables
and the function and change nothing else.

**Seed.** In `supabase/seed.sql`, for the dev user
(`11111111-1111-4111-8111-111111111111`) and account
(`22222222-2222-4222-8222-222222222222`), with fixed ids:

- one `time` routine ("Writing", eligible all week) with a goal of 210 for
  this week's Monday — `date_trunc('week', now())::date` is Monday-based in
  Postgres — and two or three logs on recent days;
- one `amount` routine with a label ("Running", `km`, eligible Mon–Fri) with a
  goal and a couple of logs;
- one tick routine ("Bedtime", no label, 7 a week) with a log on each of the
  last few days.

Dates relative to `now()`, as the event seed does, so a reset always lands
data in the current week.

**Done when:** `supabase db reset` applies cleanly and the seed rows are in
Studio; a second signed-in user sees none of them (check with a second seed
user or by running a `select` under a different `auth.uid()` in the SQL
editor); `npm run typecheck` passes on the regenerated types. After the merge,
`supabase migration list --linked` shows `0027` applied.

---

## Step 2 — client, service maths, domain

**PR:** everything below `routes/`, with tests. No screen changes yet.

### `src/client/routines.ts`

Types the app uses, declared here as `client/notes.ts` does:

```ts
Routine     { id, name, kind: 'time' | 'amount', unit: string | null,
              eligibleDays: number[] /* ISO 1–7 */, sortOrder, archivedAt: string | null,
              goals: RoutineGoal[] }
RoutineGoal { weekStart: string /* ISO date, a Monday */, target: number }
RoutineLog  { id, routineId, onDate: string, amount: number }
```

Reads:

- `fetchRoutines(accountId, userId)` — every routine of this user in this
  account, archived included, goals embedded
  (`routine_goal!routine_goal_routine_id_fkey(week_start, target)`; one path,
  so the hint is only explicit, but DEV.md §5 says keep it), ordered by
  `sort_order, id`, through `fetchAll`.
- `fetchLogs(accountId, weekStart)` — the logs with `on_date` in
  `[weekStart, weekStart + 6]`, ordered by `on_date, id`. The table has no
  `account_id`, and RLS scopes to the user across *all* their accounts, so
  the query joins the routine for the account:
  `select('…, routine!inner(account_id)').eq('routine.account_id', accountId)`.

Writes, each small and replayable:

- `saveRoutine(accountId, userId, routine, { isNew })` — upsert the full row
  by id when new (so a replay rewrites rather than duplicates), otherwise an
  update of `name, unit, eligible_days, sort_order, updated_at`. `kind` is
  never updated.
- `archiveRoutine(id)` — sets `archived_at`.
- `deleteRoutine(id)` — the cascade takes goals and logs.
- `setGoal(routineId, weekStart, target)` — upsert on
  `(routine_id, week_start)`.
- `saveLog(log, { isNew })` — upsert by id when new, otherwise update
  `on_date, amount, updated_at`.
- `deleteLog(id)`.

Numeric columns arrive as JSON numbers through PostgREST; nothing to parse.
A small `routines.test.ts` covers the row↔app mapping if any conversion is
not a plain rename.

### `src/services/routines/week.ts`

Pure functions, no React, no cache. This is where the design's rules 1, 2
and 4 live as code:

- `weekDays(weekStart)` — the seven ISO dates.
- `targetFor(goals, weekStart)` — the goal with the greatest `weekStart` not
  after the week's Monday, or `undefined`.
- `weekTotal(logs)` — the sum.
- `hint({ kind, target, total, eligibleDays, today, weekStart })` — the
  design's formula, rounded (five minutes for `time`, whole or one decimal
  for `amount`), `undefined` when today is ineligible, the target is met, or
  no goal applies.
- `formatQuantity(kind, unit, n)` — `25 min`, `3 h 30`, `8 km`, `4`.

`week.test.ts` pins: no goals; a goal dated a future Monday is ignored; a
row for this Monday replaces mid-week; past weeks keep their row; the hint on
an ineligible day, on the last eligible day, once met, and its rounding;
formatting of each kind. Break the code once per test and watch it fail
(DEV.md §6).

### `src/domains/routines/`

In the shape of `domains/notes/`:

- `types.ts` — re-exports the client's types.
- `queries.ts` — `routinesKey(accountId)`, `logsPrefix(accountId)` and
  `logsKey(accountId, weekStart)` under it, `useRoutines(accountId, select?)`,
  `useWeekLogs(accountId, weekStart, select?)`. Five-minute stale time;
  realtime does the rest.
- `mutations.ts` — one change union and one write hook:

  ```ts
  type RoutinesChange =
    | { kind: 'saveRoutine'; routine: Routine; isNew: boolean }
    | { kind: 'archiveRoutine'; id: string }
    | { kind: 'removeRoutine'; id: string }
    | { kind: 'setGoal'; routineId: string; weekStart: string; target: number }
    | { kind: 'saveLog'; log: RoutineLog; isNew: boolean }
    | { kind: 'removeLog'; id: string }
  type RoutinesWrite = { accountId: string; userId: string; change: RoutinesChange }
  ```

  `registerRoutinesDefaults(queryClient)` with `scope: { id: APP_SCOPE }`,
  `onMutate` applying the patch to `routinesKey` or to the `logsKey` of the
  log's week (`mondayOf` of its date), `onError` → `rollback`, `onSettled`
  invalidating what it touched. `removeRoutine` also drops the routine's
  logs from every cached week (`getQueriesData({ queryKey: logsPrefix })`,
  the way the events domain walks its month windows). `useRoutinesWrite()`.
- `patches.ts` — `patchSaveRoutine`, `patchArchiveRoutine`,
  `patchRemoveRoutine`, `patchSetGoal`, `patchSaveLog`, `patchRemoveLog`.
  Pure; `patches.test.ts`.
- `selectors.ts` — `activeRoutines`, `routineFor(id)`, `logsForRoutine(id)`,
  `logsOn(date)`. Pure; tested alongside the patches.

### `src/domains/index.ts`

- `registerRoutinesDefaults(queryClient)` in `registerDomainDefaults`.
- `queryKeysForTable`: `routine` and `routine_goal` → `[routinesKey]`;
  `routine_log` → `[logsPrefix]`. Two cases added to `domains.test.ts`.

Adding a domain adds mutation keys without changing any, so `CACHE_BUSTER`
stays where it is.

**Done when:** every new test passes and each was seen to fail once; the
suite count in DEV.md §6 will be updated in step 5. Nothing on screen has
changed.

---

## Step 3 — the preference, the switches, the tab, the view

**PR:** routines become visible.

### Preferences

`client/preferences.ts` — two optional keys on `Preferences`, documented
like `timezone`:

```ts
routinesEnabled?: boolean   // the tab exists; absent means false
routinesHint?: boolean      // the hint shows; absent means true
```

Read with `?? false` and `?? true` at the call sites. The read path spreads
stored prefs over defaults, so nothing else changes.

### Settings

`domains/routines/components/RoutinesSettings.tsx`: two labelled switches,
the hint's disabled while routines are off. `SettingsRoute` renders it above
the account panel and writes through `savePrefs({ ...prefs, routinesEnabled })`
as the colour overrides do. The existing toggles (`NotificationToggle`,
`GestureDebugToggle`) each carry their own markup; if the two routines
switches would be a third copy, extract a `ToggleRow` into `assets/ui/` first
and use it in all three.

### The tab

`App.tsx` `TabBar` reads `usePreferences(accountId, userId)` (it is inside the
authenticated shell, so `useAccount` is available) and renders, when enabled,
an icon `Link` to `/routines` with `s.iconTab`, placed left of Settings.
Icon: `Repeat` from `lucide-react`; change it if it reads badly at tab size.

### Routes

In `routes.tsx`:

```ts
'/routines':     { component: RoutinesRoute },
'/routines/new': { component: NewRoutineRoute,  parent: null },   // step 4
'/routines/:id': { component: EditRoutineRoute, parent: null },   // step 4
```

A guard only sees params and the router's own context, so the preference
check is in the component: `RoutinesRoute` reads `usePreferences`, and when
`routinesEnabled` is false and the read has settled, navigates to today's
`/day` with `replace`. Until step 4 the editor routes can point at a
placeholder that goes back.

### `routes/RoutinesRoute.tsx`

Composes, per DRSp:

- `useRoutines(accountId, activeRoutines)`;
- `useWeekLogs(accountId, mondayOf(now))`, with `now` from
  `assets/hooks/useNow` so the week rolls over at midnight without a reload;
- per routine, through `services/routines/week.ts`: today's logs, the week
  total, the target in force, and the hint when `routinesHint` is on;
- `SectionView` with the title "Routines" and a `+` in the header to
  `/routines/new`.

Views, in `domains/routines/components/`, props only:

- `TodayList` — one row per routine: name, today's quantity, `total / target`
  (or just the total with no goal), the hint as secondary text. The row's
  main tap is the log action; a second control opens `DayLogs`.
- `LogSheet` — for `time`: hours and minutes fields; for `amount`: a
  `NumberField` with the unit beside it; a day picker limited to the current
  week, defaulting to today. Save calls `onSave(onDate, amount)`.
- `DayLogs` — the routine's logs for a chosen day, each editable and
  deletable.
- `WeekStrip` — seven columns, today marked, one line per routine, a mark on
  each day with a log.

Tick routines log `{ id: uid(), routineId, onDate: today, amount: 1 }` with
`isNew: true` on the row tap; the row shows today's count.

**Done when,** against the local seed: the switch shows and hides the tab and
survives a reload; a tick, a time and an amount log each appear at once and
are still there after a reload; editing and deleting a log works; a log made
with the network off appears, and lands when it comes back; a log in a second
browser tab appears in the first without a reload (the realtime path); with
the hint switch off no hint renders; a deep link to `/routines` with routines
off lands on today.

---

## Step 4 — the editor

**PR:** creating and changing routines in the app, not only in the seed.

`routes/RoutineRoute.tsx`, in the shape of `TemplateRoute.tsx`: a `useClose`
that goes back or to `/routines`, `NewRoutineRoute` and `EditRoutineRoute`
over one `RoutineSession`, `EditorPageView` with Save disabled until the draft
differs.

The draft, in `domains/routines/draft.ts` with its `draftChanged` and
`draftValid` tested:

```ts
{ name, kind, unit, eligibleDays, target: number | null,
  applyFrom: 'thisWeek' | 'nextWeek', sortOrder }
```

- `kind` is a choice for a new routine and read-only text for an existing
  one (design rule 3).
- `unit` shows only for `amount`; blank means a tick.
- `eligibleDays` is seven toggles labelled from `DAY_NAMES`.
- `target` is entered in the routine's unit (hours and minutes for `time`);
  `applyFrom` is a two-way choice, defaulting to this week. On save, a changed
  target writes `setGoal(routineId, monday, target)` with the Monday of this
  week or the next (`mondayOf`, `addDays(…, 7)`), after `saveRoutine` in the
  same ordered queue.
- **Archive** is a button on an existing routine; it closes the page.
- **Delete** is behind `ConfirmDialog` with `destructive`; it closes the page.
- **Reordering:** up and down arrows on the editor change `sortOrder` by
  swapping with the neighbour, written as two `saveRoutine` changes. This
  keeps reordering in the editor as the design says; if it proves clumsy in
  use, a manage mode on the list is the alternative and is a design change.

`RoutineForm` in `domains/routines/components/` renders the draft; the route
owns it and the writes.

**Done when:** a routine can be created, edited, archived and deleted from the
app; a target changed "this week" moves this week's `total / target` at once
and leaves last week's goal row untouched; one changed "from next week"
leaves this week alone and shows up when the week turns (check by inserting a
log dated next Monday in Studio, or by temporarily shifting `now` in dev);
archiving removes the routine from Today and the strip and keeps its rows in
Studio.

---

## Step 5 — docs

**PR:** the docs describe what shipped.

- `DEV.md` §1: six tabs when routines are on. §2: fourteen tables, the three
  rows and the column sketch, `owns_routine` in the functions list, the three
  tables in the realtime list. §3: a block on routines — weeks independent,
  the goal row keyed by Monday, the hint as the one derived value, private by
  RLS. §5: any gotcha found while building (the logs query needing the
  account join is a candidate). §6: the new tests and the new count. §8:
  remove routines from "designed, not built"; what remains is the calendar
  integration, time anchors and past weeks. §10: `0027`.
- `README.md`: routines in the feature list; the docs entry says built.
- `ROUTINES.md`: status line to "built; calendar integration, time anchors
  and past weeks are designed, not built".
- This file to `archive/` with a row in `archive/README.md`.

**Done when** DEV.md's description of every table, function and tab matches
`main`.

---

## Decided here, flag if wrong

- The plan is five PRs: schema; data layer; preference, tab and view; editor;
  docs. Steps 3 and 4 could merge into one if the view without an editor is
  not worth a release on its own — the seed covers local use either way.
- The logs read joins `routine` for the account rather than filtering by the
  routine ids already in the cache.
- Reordering is arrows in the editor, not drag and not a manage mode.
- The tab goes left of Settings and uses the `Repeat` icon.
- `routinesHint` is read as default-true from an absent key, so turning the
  feature on shows the hint until it is switched off.
