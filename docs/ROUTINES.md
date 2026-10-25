# Routines

A personal weekly planner beside the calendar, for recurring activities that
are not appointments: running, writing, a weekly night out, a daily bedtime.

**Status: design, ready to build.** Nothing here exists in the schema or the
app. Routines are **opt-in** (a switch in Settings), live in **a view of their
own** (an icon tab), and are **private** to the signed-in user. Integration with
the calendar screens comes later, after the first version has been used; what
that integration will need is noted at the end and otherwise out of scope.

The principles constrain every later decision, so they come first.

---

## Principles

1. **The app has no activity types.** It holds a measure, a weekly target,
   eligible days and a log. Targets are set and changed only by the user. The
   one derived value the app shows is the hint (rule 4), and a preference turns
   it off.

2. **It records logs, not their absence.** There is no row, label, colour or
   count for a day without a log, and no streak. A week with few logs has a
   small total and nothing else.

3. **Weeks are independent.** A week's total is the sum of its logs and its
   target is its goal. Nothing is carried from one week to the next in either
   direction. There is no pause state.

4. **Targets have a history.** A change applies to the current week unless the
   user chooses "from next week". Past weeks keep the target they had.

5. **Private.** Routines belong to the user, not to a person row, and other
   members of the account cannot read them. Row-level security enforces this.

6. **Logging is the only write in daily use.** One tap for a tick, one number
   for an amount. There is no timer and no planning step.

7. **The hint is derived from the user's own numbers:** the remaining target
   divided over the remaining eligible days. It is text, the only
   forward-looking value in the view, and a preference turns it off.

---

## What a routine is

An **amount of something per week**, where "something" can be just
occurrences. Two kinds:

| Kind | Stored as | Shown as | Example |
|---|---|---|---|
| `time` | minutes | hours and minutes | writing, 3 h 30 a week |
| `amount` | a number, decimals allowed, with an optional label | the number and its label; a blank label is a tick, and a tick logs 1 | running, 50 km a week; night out, 1 a week; bedtime, 7 a week |

The weekly target is a **threshold**. The app does not distinguish between
meeting it and exceeding it.

**Eligible days** are the weekdays the hint distributes the remaining target
over. They exist for the hint only — they never gate a log, and a log on an
ineligible day counts like any other.

**Period is always a week**, Monday to Sunday, matching the calendar. A daily
routine is "7 a week".

---

## Tables

Three tables, `0027`. All three are per user, and the user's row is the only
thing access control looks at.

```sql
-- A routine. Tenancy is the account (where its view appears); ownership is
-- the user, and a routine is never shared.
create table routine (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references account(id) on delete cascade,
  user_id        uuid not null references app_user(id) on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('time', 'amount')),
  -- The amount's label ("km", "pages"). Null is a tick. Always null for time.
  unit           text check (kind = 'amount' or unit is null),
  -- ISO weekdays, 1 = Monday. For the hint only.
  eligible_days  smallint[] not null default '{1,2,3,4,5,6,7}',
  sort_order     integer not null default 0,
  -- Set to retire a routine and keep its record; null while it is active.
  archived_at    timestamptz,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on routine (user_id, account_id);

-- The target, as it stood from a given week on. One row per change; the
-- target for a week is the latest row on or before that week's Monday.
create table routine_goal (
  routine_id  uuid not null references routine(id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  -- Minutes for time, the amount's own unit otherwise.
  target      numeric not null check (target > 0),
  created_at  timestamptz not null default now(),
  primary key (routine_id, week_start)
);

-- What happened: one row per log, several a day allowed.
create table routine_log (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references routine(id) on delete cascade,
  on_date     date not null,
  -- Minutes for time, the amount's own unit otherwise. A tick is 1.
  amount      numeric not null check (amount > 0),
  -- The house pressure valve, as on the event tables and `note`. Nothing
  -- reads or writes it in the first version.
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on routine_log (routine_id, on_date);
```

**Access.** A routine is readable and writable by its user alone, within an
account they belong to, in the shape of `user_preference`'s policy. The two
child tables go through the routine:

```sql
create function owns_routine(p_routine uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from routine where id = p_routine and user_id = auth.uid())
$$;

create policy routine_rw on routine for all to authenticated
  using      (user_id = auth.uid() and is_account_member(account_id))
  with check (user_id = auth.uid() and is_account_member(account_id));
create policy routine_goal_rw on routine_goal for all to authenticated
  using (owns_routine(routine_id)) with check (owns_routine(routine_id));
create policy routine_log_rw on routine_log for all to authenticated
  using (owns_routine(routine_id)) with check (owns_routine(routine_id));
```

Table privileges come from `0004`'s default grants; `owns_routine` is granted
to `authenticated` and revoked from `public`, like `can_access_series`.

**Realtime.** All three tables join the publication with `replica identity
full`. Only the owning user receives changes, and the same user on a second
device needs them. The gating column is not in `routine_log`'s primary key, so
without the full old row a DELETE would be filtered out (see `0011`).

**Why `account_id` on a private table.** For the same reason `user_preference`
has it: the account is where the view appears, a user in two accounts keeps
two sets, and deleting an account takes its routines with it.

---

## Rules

### 1. The week's target is the latest goal on or before its Monday
`routine_goal` is keyed by the Monday a target first applies to. Reading a
week means taking the row with the greatest `week_start` that is not after the
week's own Monday. A routine with no goal row yet shows its totals and no
target, and no hint.

"Apply right away" writes a row for **this** Monday, replacing one if the
target already changed this week. "From next week" writes a row for next
Monday, and this week carries on under its current target. Neither touches a
past week, whose Monday is earlier than both. This one rule gives history,
immediate changes and planning ahead, so the first version has all three.

### 2. A week's total is the sum of its logs, and nothing else
No column holds a carried balance, no row records an absent log, nothing is
computed across weeks. The strip for a week is its logs; the number beside the
target is their sum. Deleting a log lowers the total; that is the only way a
total goes down.

### 3. Two kinds, one log shape
Every log is one `numeric`. For `time` it is minutes; the editors take and show
hours and minutes. For `amount` it is the routine's own unit, decimals allowed,
and a routine with no label is a tick whose log is 1. The kind is set when the
routine is made and does not change — a routine that has been logged in
minutes cannot start counting kilometres.

### 4. The hint
On an eligible day, when the week's total is below the target and at least one
eligible day remains from today through Sunday:

```
ask = (target − total) / eligible days from today to Sunday, today included
```

Rounded: five minutes for time, a whole number or one decimal for amounts. It
is a line of secondary text under the routine. On an ineligible day, or once
the target is met, it is not shown. It is not rendered as a bar, a colour or a
warning, and `prefs.routinesHint = false` removes it. It is the only derived
forward-looking value in the feature.

### 5. Logging
- A **tick** routine logs 1 for today on one tap. The row shows today's count;
  a second tap logs another, and the day's logs are listed so an extra log
  can be removed.
- A **time** or **amount** routine opens a small sheet: the amount, and the
  day, which defaults to today and may be any day of the **current** week, so
  a log can be entered the day after. Logging into a past week is not offered
  in the first version; the view does not show past weeks.
- A log's id is minted by the app before the write, and the write is an upsert
  by id, so a save replayed after a lost response rewrites rather than
  duplicates. Writes are change objects through the shared queue, like every
  other domain's, and a log made offline shows at once and goes out in order.
- A log can be edited and deleted from the day's list.

### 6. Archive by default
Archiving a routine sets `archived_at`. It leaves Today and the strip and
keeps every log and goal. Delete exists too, behind a confirmation, and
cascades. There is no un-archive in the first version.

### 7. Opt-in, and where the switch is
Two keys on `user_preference.prefs`, flat like the existing ones:

```ts
routinesEnabled?: boolean   // the tab exists; default false
routinesHint?: boolean      // the hint shows; default true
```

Both sit in Settings, the hint switch under the enable switch. With routines
off, the `/routines` routes redirect to today's `/day`, so a stale deep link
lands on the calendar.

### 8. What is deliberately absent
Streaks. "Missed" in any form. Carry-over. Pause. Ceilings and progression.
Activity types. A timer. Time anchors. Partner visibility. Past weeks. Stats
beyond this week's totals. Each is excluded by the principles above. Adding one
is a design change.

---

## The view

`/routines` is an icon tab in the bar, present only when enabled. Rendering
detail is out of scope, as in `NOTE_MODEL.md`; this is what the screen holds.

**Today**, on top. One row per active routine, in `sort_order`:

- the name;
- what is logged today — `25 min`, `8 km`, a count for a tick, or nothing;
- the week so far against the target — `140 / 210 min`, `21 / 50 km`, `4 / 7`;
- the hint, as secondary text, when rule 4 produces one.

The tap target is the log action: a tick logs now, the others open the sheet.
A second control opens the day's logs for editing.

**The week**, as a strip under Today. Monday to Sunday, today marked, one thin
line per routine, a mark on each day with a log. It shows which days have
logs; the totals are in the rows above.

**Managing routines** is a full-page editor route, like the template editor:
`/routines/new` and `/routines/:id`. Name, kind (fixed once made), unit,
eligible days, the target with "this week" or "from next week", archive, and
delete behind a confirmation. Reordering is in the same place.

---

## In the code

Where each piece goes, by the layer rules in [`ARCHITECTURE.md`](./ARCHITECTURE.md):

- `client/routines.ts` — every call: routines with their goals (one read, the
  account's handful), the logs of one week, and the writes.
- `domains/routines/` — `queries.ts` (`routinesKey(accountId)`,
  `logsKey(accountId, weekStart)`), `mutations.ts` (change objects:
  `saveRoutine`, `archiveRoutine`, `removeRoutine`, `setGoal`, `addLog`,
  `updateLog`, `removeLog`), `patches.ts`, `selectors.ts` (today's rows, the
  strip, the target for a week), `components/`.
- `services/routines/week.ts` — the pure maths: a week's total, the target in
  force, the hint, formatting minutes. Tested without a cache or a network,
  including the rounding and the "no eligible day left" case.
- `domains/index.ts` — `registerRoutinesDefaults`, and `queryKeysForTable`:
  `routine` and `routine_goal` → `routinesKey`; `routine_log` → the logs
  prefix.
- `routes/RoutinesRoute.tsx`, `routes/RoutineRoute.tsx` — the view and the
  editor; a guard on both reads the preference.
- `App.tsx` — the tab, behind the preference. Settings — the two switches.

Adding a domain adds mutation keys without changing any, so `CACHE_BUSTER`
need not move; it moves if a key is renamed later.

---

## Build order

Step by step, with files and done-criteria, in
[`ROUTINES_PLAN.md`](./ROUTINES_PLAN.md). In outline:

1. `0027_routines.sql` — the three tables, `owns_routine`, policies, realtime.
2. Client, domain and `services/routines/week.ts`, with the maths tests.
3. The two preference keys and the Settings switches; the tab; the `/routines`
   view with Today and the strip; the editor route.
4. Later, each its own design pass: time anchors and the Day view (a
   personal, movable block drawn distinctly from an event); past weeks in the
   strip; importing logs from a device.

---

## Decided here, flag if wrong

Small calls made while writing this, each easy to change before step 1:

- Per user **per account**, mirroring `user_preference`, rather than per user
  across accounts.
- Eligible days as ISO weekday numbers in a `smallint[]`, default all seven.
- A log may be dated any day of the current week, not only today.
- A tick routine's second tap logs another 1 rather than undoing the first.
- Archive hides without un-archive in the first version.
- Realtime on all three tables, for the second-device case.
- Hint rounding: five minutes for time, whole or one decimal for amounts.
