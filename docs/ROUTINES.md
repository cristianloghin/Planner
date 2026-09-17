# Routines

A person's ideal week: the shape of their days when nothing gets in the way.

A **routine** is a weekly template that belongs to one person. It says what
that person is doing at a given time on a given weekday *by default* — sleep,
school, deep work, exercise every other Tuesday at 16:00 — so that the family
calendar can show a day as it was meant to go, under the events that actually
happened to it.

**Status: design only.** Nothing here is built. This document fixes the model,
the rules that govern it and the reasoning behind them; the screens are
described only as far as the storage has to know about them. It is the first
of three planned changes; the other two are in [`NAVIGATION.md`](./NAVIGATION.md).

---

## What a routine is, and is not

A routine is **a default, not an exception.** An event says something is
happening at this time and the household coordinates around it. A routine says
what a person is doing *when nothing else is happening*. That one difference
drives every rule below:

- **Events win.** An event landing on a routine block is not a conflict. The
  routine is the background; events paint over it; a covered block recedes.
- **Missing one means nothing.** Cancelling an event occurrence is a fact worth
  a row. Not exercising on a Tuesday because a meeting ran over is just a day.
  A routine has **no per-day state of any kind** — no override, no cancel, no
  done, no skip. It is pure template.
- **It is week-shaped, not date-shaped.** No `dtstart`, no `UNTIL`, no `COUNT`,
  no identity per day. "Every other Tuesday" is not `INTERVAL=2`; it is an
  A week and a B week.
- **It is the ideal, and the app has no opinion about it.** The app shows the
  ideal under the real. It never says a block was missed, never keeps a streak,
  never nags. That is the whole difference between this and a habit tracker,
  and it is a principle, not an omission.

It is therefore **not** an `event_series` with a flag. A series has recurrence
maths that `services/recurrence` and the reminder sender both implement and a
test cross-validates; per-day rows in `event_occurrence`; attendees; reminders.
A routine needs none of it, and bolting it onto the series would inherit all
of it.

---

## Tables

One table. A routine is read whole, written whole, and never joined.

```sql
-- One per person. `person_id` is the owner; `account_id` is tenancy and is
-- always set, so RLS is the same membership rule as every other table.
create table routine (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account(id) on delete cascade,
  person_id     uuid not null references person(id)  on delete cascade,
  -- How many weeks the pattern spans before it repeats. 1 is a plain week;
  -- 2 gives an A week and a B week ("every other Tuesday").
  cycle_weeks   int  not null default 1 check (cycle_weeks between 1 and 2),
  -- A Monday. Week 0 of the cycle is the week starting here; week n is the
  -- week starting n*7 days later, modulo `cycle_weeks`.
  anchor_monday date not null,
  blocks        jsonb not null default '{}',
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index routine_one_per_person on routine (person_id);
create index on routine (account_id);

alter table routine enable row level security;
create policy routine_rw on routine for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));
grant select, insert, update, delete on routine to authenticated;

-- Published like `person`: a partner's edit appears live. Full replica
-- identity so a delete is RLS-checked (see 0011).
alter table routine replica identity full;
alter publication supabase_realtime add table routine;
```

### The blocks document

`blocks` is an object keyed by block id — never an array, so every write is
addressable by path and no block's identity depends on its position.

```json
{
  "5c1f…": { "week": 0, "day": 1, "start": 960,  "duration": 60,  "title": "Exercise", "color": "3" },
  "9a02…": { "week": 0, "day": 0, "start": 540,  "duration": 180, "title": "Deep work" },
  "b73d…": { "week": 1, "day": 1, "start": 960,  "duration": 60,  "title": "Exercise", "color": "3" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `week` | int | Index within the cycle, `0 ≤ week < cycle_weeks`. |
| `day` | int | Weekday, `0` = Monday … `6` = Sunday. |
| `start` | int | Minute of the day, `0 … 1439`. |
| `duration` | int | Minutes, `> 0`. May run past midnight; the day it spills into draws the remainder. |
| `title` | string | What the block is. May be empty. |
| `color` | palette key | Optional. Absent means the owner's lane colour, exactly as an event without a colour. |

Blocks within one routine are kept **disjoint by the editor**, not by the
store. A routine is an ideal day and an ideal day does not overlap with
itself; if two blocks do overlap (an old row, a hand edit) the renderer cascades
them the way `services/timeline-layout` cascades events, and nothing breaks.

### Which week is it

The only arithmetic in the feature:

```
weekIndex(date) = mod( floor( daysBetween(anchorMonday, mondayOf(date)) / 7 ), cycleWeeks )
```

with a modulo that is non-negative for dates before the anchor. A routine with
`cycle_weeks = 1` has every week at index 0 and the anchor is irrelevant. This
lives in the routines domain, **not** in `services/recurrence`: it is not
recurrence, it shares nothing with the rrule engine, and it must not become a
third implementation the sender has to mirror.

---

## Reads and writes

**The client** (`client/routines.ts`) fetches every routine in the account in
one query — there is one per person and a household has a handful of people —
and saves one whole. The app's `Routine` type is the row's shape with `blocks`
typed; nothing converts.

**The domain** (`domains/routines/`) follows [`ARCHITECTURE.md`](./ARCHITECTURE.md)
exactly: `queries.ts`, `mutations.ts`, `patches.ts`, `selectors.ts`, `types.ts`,
and dumb components. Writes are change objects, registered at start-up with
`registerDomainDefaults` so an edit made offline survives a restart; the table
is mapped in `queryKeysForTable`; `CACHE_BUSTER` is bumped when the mutation
keys land.

**The one selector that matters:** blocks for a person on a date. It resolves
the week index, filters by weekday, and splits anything that spills past
midnight into this day's remainder from yesterday and this day's own blocks.
It is called per lane per rendered day, like `occurrencesOnDate`, and it is
cheap for the same reason the recurrence engine is: arithmetic, no expansion.

---

## Where a routine shows

A routine is drawn as a **backdrop**: under the events, in its owner's lane,
in a lighter treatment than an event block — a tinted band with a small label.
Events stay opaque on top and win every overlap. What is visible of the
routine is the part of the ideal that survived the day.

Whether the backdrop is drawn at all depends on the calendar level (see
[`NAVIGATION.md`](./NAVIGATION.md) for the levels):

| Level | Routine backdrop |
|---|---|
| **My lane** (one person, full width) | **On by default.** This is the personal planner. A user can turn it off. |
| **Family day** (a lane per person) | **Off by default, per lane.** A user opts a lane in — their own included — to see that person's ideal day under their real one. This is the transparency feature in its quiet form: nobody's routine is pushed at anyone, and "bring up her routine for today" is one tap on her lane. |
| **Week** | Never. The calendar week is the *actual* week; the routine editor is the *ideal* week. Drawing one under the other at that scale blurs the two things the feature depends on keeping apart. |
| **Month** | Never. |

Both choices are the user's own view of the household, so they live in the
per-user preferences document, beside colour overrides:

```ts
// client/preferences.ts — additions
routines?: {
  /** The backdrop in the my-lane level. Default true. */
  inMyLane: boolean
  /** Whose backdrop the family day shows. Default none. */
  familyDayLanes: PersonId[]
}
```

Nothing new in the schema: `user_preference.prefs` already holds "how this
user sees things", and this is that.

**The event editor** is where the transparency becomes actionable. It knows
the day and the attendees; for each attendee it can show, as plain
information, which routine block the event's time falls on — "16:00 Tuesday
is Nora's Exercise". Not a warning, not a conflict to resolve, nothing
recorded. It tells you what you are placing the event on and you decide.

---

## The editor

A routine is edited in its own calm place, not from the calendar. The
established methods this feature draws on (time blocking, the "ideal week")
all agree that the ideal week is composed once and *reviewed* on a cadence,
not re-litigated daily. The editor lives in the library, as a third option
beside templates and notes, which the header's option menu already supports.

What it is: a day-shape editor. A person's week (or two) as columns of blocks
whose boundaries you drag, with **"copy this day to…"** so that composing a
workday once and stamping it Monday to Friday is quick. While editing it shows
how much of a day the routine claims, so an ideal day with no slack is visible
as such — shown, not scolded.

Edited in place, no history. The same trade the codebase already made for
series: "a series is edited in place; there is no split". The ideal week gets
remade at natural boundaries — a Monday, a season, a new job — and that is
healthy, not failure; the editor should make reshaping cheap.

---

## Which lane is me

The my-lane level and its default-on backdrop need the app to know which
person the signed-in user is. The schema has had this since `0005`:
`person.user_id` is an optional link to a login, and `create_account` sets it
for the account's first person. **Nothing in `src` reads it** — `fetchPeople`
does not select it — and no second member of an account gets a link.

So this feature adds, in Settings, a small affordance: **"this lane is me"**,
which writes `user_id` on the chosen person (and clears it on any other person
in the account that had it, since the partial unique index allows one per
login). `fetchPeople` gains the column; `domains/people/selectors` gains a
`me` selector. Until it is set, the my-lane level shows a lane with **no
backdrop and says why**, rather than guessing a person and showing their
routine as if it were yours.

---

## Decisions

### 1. A routine belongs to a person, not a user
`person_id`, not `user_id`. A routine is *about* a lane on the calendar, so it
hangs off the thing that is a lane.

This is "people are data" applied once more, and it has three consequences
that all point the same way. RLS stays uniform — account membership, nothing
per-row. A child, who is a person without a login, gets a routine — school
hours, nap, bedtime — which is arguably the most useful routine in a
household. And "which lane is me" stops being a blocker for the feature and
becomes a nicety for defaults.

*Rejected:* a routine private to a user (`user_id`, RLS `owner = auth.uid()`).
It was the starting point — "my routine doesn't concern the others" — and it
is wrong on reflection. The household's power is transparency: whether an
event cuts into a partner's personal time is exactly the information the app
exists to make visible. Visibility is handled by *what is shown by default*
(see the levels table), not by what is stored where.

### 2. Anyone in the account may edit any routine
Nothing in the app has per-user edit rights; anyone can rename anyone. Routines
follow the house rule and the household's own norms decide who touches whose.

*Rejected:* owner-only editing. It would introduce ownership to a codebase that
deliberately has none, for a case that social norms already cover. It is easy
to add later if it ever matters.

### 3. Blocks are one JSON document, not a table of rows
Same reasoning as the note model's Decision 3, and it holds even more cleanly
here: a routine is always read whole, its blocks reference nothing, no SQL
ever aggregates them, and the whole account's routines fit in one small query.

*Rejected:* a `routine_block` table. It buys per-row foreign keys (there is
nothing to point at — `color` is a palette key, not a row), SQL aggregation
(nothing aggregates), and row-grain realtime (a routine changes as a unit).
It costs a table, a join, and a second realtime subscription.

**Accepted consequences:** Postgres rewrites the whole document per edit, so
the editor debounces. And an edit to one block from two phones at once is
last-writer-wins on the document, not on the block. At household scale, with
an editor that is opened on purpose and rarely, that is acceptable.

### 4. A cycle of one or two weeks, with an anchor
Not an rrule. The pattern people actually have is "this week / that week",
and the anchor makes A and B unambiguous without a start date the routine does
not otherwise want. Two is the cap because nobody's ideal week has a period of
three, and every extra week is a screen of editing.

*Rejected:* archetypes — named day shapes ("workday", "weekend") assigned to
weekdays. Purer, and it is how people *think*, but it adds a table and an
assignment step. The flat model with "copy this day to…" in the editor gives
the same composing speed with none of the structure. Archetypes can be layered
on later without changing what a block is.

### 5. No per-day state, and no reminders, in the first cut
No override, cancel, done or skip: see *What a routine is*. No reminders
either: a reminder on a routine block would mean a third schedule
implementation in the sender for cheap maths and a new code path to keep
honest. If it comes, it comes on its own.

### 6. One routine per person, edited in place
Enforced by a unique index. Named routines that a person switches between
("summer", "working from home") are a plausible extension — the fresh-start
effect says people remake plans at boundaries — and would be a `name` column
and an `active` flag, not a change to blocks. Not now.

---

## Out of scope, deliberately

- **Accountability of any kind.** Done, skipped, streaks, "you missed". Migration
  `0022` removed occurrence status on purpose; if per-day state ever returns it
  returns for routines, where it would belong, and as a separate decision.
- **Soft blocks.** "An hour somewhere in the afternoon" rather than "16:00".
  Auto-schedulers model habits this way. If it comes it is a property of a
  block, not a different model.
- **A daily planning ritual.** Choosing today's plan from the ideal is a
  per-day thing, and per-day is what this model refuses.
- **Routines outside an account.** Tenancy is the account, everywhere.

---

## Open questions

- The exact treatment of the backdrop (tint, hatch, label size) is a design
  pass on the phone, not a decision for this document.
- Whether the family-day lane toggle lives in the lane head, a long-press, or a
  small control row. Decide on the device.
- Whether the editor's "copy this day to…" is enough, or archetypes (Decision
  4) are wanted after a few weeks of use.
