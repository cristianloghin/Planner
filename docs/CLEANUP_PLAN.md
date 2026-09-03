# Strip Planner down to its essentials

## Context

Planner has accumulated features that sit outside what the app is actually for:
a shared weekly calendar for two people. Standalone Lists, free-text notes on
events, occurrence→occurrence dependency links, per-occurrence status, event
checklists and the "this and following" series split each carry their own
screens, domain, client module, database tables or SQL functions, and each is a
seam that every future change has to route around.

The goal is removal, not refactoring: delete the feature, its data layer, its
schema and its tests, and leave the calendar behind it simpler than it was.

**Kept, and not in scope for this work:** auth and accounts, people as data,
events with recurrence, per-occurrence rescheduling and cancellation, reminders
(in-app and push), event templates, event search over titles, colours, realtime
sync, and the Day / Week / Month / Settings screens.

**Not kept, and worth saying plainly:** every form of completion. The manual
done / skipped / blocked mark goes with the linking work (§3b) and checklists go
entirely (§7). After this plan an occurrence cannot be marked done by any means.
The only per-day facts the app records are *moved* and *cancelled*. Stored
status values are dropped with their columns — deliberately carried nowhere, so
no old code path has anything left to read.

**Also going (§6, §9):** the structure the schema carries and no code path uses —
a dead second roster model, a set of vestigial columns, every enum-as-table
lookup — plus one rename; and the series split, so that an edit goes to the
whole series or to one occurrence and nothing in between.

**Added (§8):** a user-facing end for a series — after N times, or on a date —
so "12 piano lessons every other Tuesday" and "fish every Monday morning until
Christmas" are things the app can say. Today there is no user-facing end at
all: a series only ends by being split or deleted forward.

**Also going, and one more addition (§10):** the adult / child distinction and
everything that hangs off it — supervision checks, clash and needs-attention
badges, the "Both" label, the first-adult default. People are just people. In
its place, the one thing the roster model lacked: an occurrence can override
who is on it.

All of it is agreed and specified below. The removals are independent in the
app code and can land as separate commits; the schema changes land in one
migration, `0022` — see §4 for the functions it recreates and drops.

Validated against the code on 2026-09-03 at `95719f2`; every `:line`
reference below is to that revision. Typecheck is clean and the suite runs
219 tests at that point.

---

## 1. Lists — remove entirely

**Decision:** the whole feature goes — the tab, the `list` / `list_item` model,
to-do search, and the occurrence links. The database tables are dropped in a
new migration.

### App code — delete outright (~2,020 lines, 11 files)

| File | Lines |
|---|---|
| `src/components/Lists.tsx` | 697 |
| `src/components/Lists.module.css` | 320 |
| `src/components/ListSearch.tsx` | 88 |
| `src/client/lists.ts` | 276 |
| `src/domains/lists/` (7 files, incl. `lists.test.ts` 191) | 638 |

### App code — edit at the four seams

1. **`src/components/OccurrenceSheet.tsx`** — delete the `LinkedTodos`
   component (~90 lines, `:354–442`) and its `<LinkedTodos …/>` call site
   (`:322`), plus the three list import statements
   (`domains/lists/{mutations,queries,selectors}`, `:14–16`). This is the
   only place Lists reaches into the calendar. The `.todoList` / `.todoRow` /
   `.todoLabel` / `.todoDue` / `.todoOverdue` rules in
   `OccurrenceSheet.module.css` (`:192–226`) serve only this component and go
   with it.
2. **`src/App.tsx`** (TABS, ~line 26) and **`src/routes/routes.tsx`** — drop the
   `/lists` route and tab; five tabs become four. `ListChecks` becomes an unused
   `lucide-react` import. The `/` guard already redirects to `/day`, so no
   landing-route change is needed.
3. **`src/domains/index.ts`** — remove `registerListsDefaults`, the
   `listsKey` / `listLinksKey` imports, and the `list` / `list_item` /
   `list_item_event_link` cases from `queryKeysForTable`. Remove the matching
   case in `src/domains/domains.test.ts` (~line 30).
4. **`src/domains/search/queries.ts`**, **`src/domains/search/types.ts`** and
   **`src/client/search.ts`** — remove `useListItemSearch`, `searchListItems`,
   `listItemSearchKey` and `ListItemSearchResult`. Event search is unaffected.

Also: drop the `ListItem` / `TodoList` re-exports from `src/types.ts`, and bump
`CACHE_BUSTER` in `src/queryClient.ts` — the mutation keys change, and a write
paused offline under a removed key is otherwise dropped silently (the rule is
recorded in `docs/STATUS.md`, "Adopting a slice").
`src/services/realtime/realtime.test.ts:83–89` uses `'list_item'` as a sample
table name; it still passes (it is a plain string) but should name a surviving
table so the test keeps meaning something.

### Database — new migration `0022`

- `drop table list_item_event_link, list_item, list cascade;` — RLS policies,
  grants, indexes and realtime publication membership go with the tables, so
  `0009`'s and `0011`'s statements need no separate reversal.
- `drop function search_list_items(uuid, text);` (defined in `0014`, recreated
  in `0017`), and `drop function can_access_list(uuid), can_access_list_item(uuid);`
  — the RLS helpers from `0009`. Postgres does not track a function body's
  dependency on a table, so these would survive the table drops as dead
  objects that error if ever called.
- `split_series` rescued list links on a split; the function itself is dropped
  (§9), so nothing needs recreating on Lists' account.
- `supabase/seed.sql` — remove the two seeded lists and their items (~line 154).

### Verification

- `npm run typecheck && npm test` — `lists.test.ts` (24 cases) and one
  `domains.test.ts` case disappear; nothing else should change colour.
- `npm run build && npm run serve:pages`, then visit `/lists` directly: it
  should fall through to the router's not-found rather than a blank screen.

---

## 2. Notes on events — remove entirely

**Decision:** events keep no free text. The `note` kind, the `note` table and
the editor UI all go. The search result snippet, which is built from note
bodies, goes with it — results become title + date.

Notes have no files of their own; this is one arm of a union unthreaded from
ten places. **Do this together with §7:** once notes and checklists are both
gone the `Attachment` union has one member left, and §7 flattens it to
`reminders`. Doing the two in one pass means the union never needs an
intermediate `checklist | reminder` state.

### App code

- **`src/domains/events/types.ts`** — delete the `note` arm of `Attachment`
  (§7 then replaces the union). The compiler points at every site below.
- **`src/domains/events/attachments.ts`** — delete `notes()` and the
  `NoteAttachment` type (§7 deletes the module).
- **`src/domains/events/transformers.ts`** — drop `notes` from `toAttachments`
  and `fromAttachments` (§7 deletes both functions).
- **`src/client/series.ts`** — delete `SeriesNote`, `Series.notes`, the
  `note!owner_series_id ( id, body )` embed in `SERIES_SELECT`, the `note` field
  on `SeriesRow`, and `syncNotes()` with its call in `saveSeries`.
- **`src/components/AttachmentsEditor.tsx`** — delete `addNote`, the note branch
  of the render, and the "Add note" control (§7 reduces the file further).
- **`src/components/EventEditor.tsx:216`** and
  **`src/components/TemplateEditor.tsx:53`** — drop the empty-note arm of the
  save-time filter (§7 removes the filter).
- **`src/components/Settings.tsx:188`** — drop the "N notes" bit of the template
  summary line.
- **`src/components/OccurrenceSheet.tsx`** — delete the `notes(event).map(…)`
  block and its `notes` import; drop the `.note` rule from
  `OccurrenceSheet.module.css`.
- **`src/domains/index.ts`** — remove `'note'` from the `event_series` case list
  in `queryKeysForTable`, and from the table array in `domains.test.ts:13`.
- **`src/domains/events/transformers.test.ts`** — the note assertions go with
  the `toAttachments` / round-trip describe blocks (§7).
- **`src/client/search.ts`** — remove `snippet` from `EventSearchResult` and its
  mapping; **`src/components/EventSearch.tsx:72`** — remove the snippet render
  and the `.snippet` rule from `src/assets/ui/Search.module.css:134`; fix the
  doc comment at `EventSearch.tsx:13` that still says "titles + note and
  checklist text".
- Stale comments that name notes: `domains/events/attachments.ts:49` (the
  module goes in §7) and `domains/index.ts:54`. The `notes: _n` omit in the
  split case of `domains/events/mutations.ts:89` goes with the case (§9).

### Database — folded into migration `0022`

- `drop table note cascade;` — takes its RLS policy, grants, replica identity
  and realtime publication membership with it. `split_series` copies `note`
  rows on a split (`0017:99`), as it does list links; it is dropped first
  (§4), so no function body is left naming the table.
- **Recreate `search_events`** without the `left join note`, the `notes_text`
  aggregate and the `snippet` column — §4. This cannot be a
  `create or replace`: the `returns table (…)` signature changes, so it must be
  `drop function search_events(uuid, text);` first.
- `supabase/seed.sql` — remove the seeded note (1 site).

### Verification

- A clean `npm run typecheck` is the primary evidence that the app code is fully
  unthreaded.
- Against the local stack: save an event with a reminder, edit it, and confirm
  it survives a reload (proves `saveSeries` is still correct without
  `syncNotes`). Then search for a word in a title and confirm the event is found
  with no snippet line.

---

## 3. Dependency linking and occurrence status — remove entirely

**Decision:** no linking anywhere in the structure, and no occurrence status at
all. This is two removals that share a seam, so they are specified together —
plus one unrelated addition that lands in the same migration (§3c): a freeform
column for future use.

### 3a. Dependency wiring

- **`src/components/OccurrenceSheet.tsx`** — delete the `DependencyEditor`
  component (~150 lines, `:444–597`), its call site (`:324`), the "⏳ Waiting
  on…" banner (`:252–260`), the `blockers` binding (`:95`), and the `edges` /
  `prereqDates` memo (`:73–78`) that widens the completions window at the top
  of the component. `useCompletionsForRange` then takes no `extraDates`: the
  parameter itself (`domains/occurrences/queries.ts:101`) and `monthsFor`'s
  third argument (`:56–59`) go; the other four callers never pass it. CSS:
  `.waiting` (`:28`) and the eleven `.dep*` rules (`:124–186`) in
  `OccurrenceSheet.module.css`.
- **`src/services/recurrence/status.ts`** — delete `blockingPrerequisites`,
  `occurrenceStatus`, `prerequisiteDatesInRange`, `UnmetPrerequisite`,
  `EventStatus` and `occurrenceEffectiveStatus`. Every consumer of these six was
  checked: all exist only to serve dependencies. (§7 then deletes the module
  altogether; only `occKey` survives, relocated.)
- **`src/services/recurrence/status.test.ts`** — goes with the module (§7).
- **`src/components/DayView.tsx`** — delete `useDependencies`, the `prereqDates`
  memo (`:103`), the `dependencies` prop threaded down to the block renderer,
  the `blocked` computation (`:438`) and its class; drop `.blocked` from
  `DayView.module.css`.
- **`src/domains/occurrences/`** — remove the dependency half of six files:
  `useDependencies` and `dependenciesKey` (queries), the `addDependency` /
  `removeDependency` change kinds and their plumbing — `WaitWrite`, `isWait`,
  the `onMutate` wait branch (`:123–150`) and the `onSettled` key choice
  (`:169`) in mutations; `patchAddDependency` / `patchRemoveDependency`
  (`:71–100`) in patches — `dependenciesByOccurrence` (transformers),
  `waitsFor` (selectors), `OccurrenceDependency` (types), and the dependency
  cases in `occurrences.test.ts` (`:102–125`, `:188–215`).
- **`src/client/occurrences.ts`** — delete `DependencyRow`, `fetchDependencies`,
  `addDependency`, `removeDependency` (~107 lines, `:291–397`).
- **`src/domains/index.ts`** — remove the `occurrence_dependency` case and the
  `dependenciesKey` import, and the matching case in `domains.test.ts:26–28`,
  which asserts the `dependencies` key for that table; **`src/types.ts`** —
  drop the `OccurrenceDependency` re-export.
- **`src/services/recurrence/expand.ts`** — `seriesOccurrenceDatesInRange`
  (`:150–161`) exists only for the prerequisite picker (its doc comment says
  so) and has no other consumer. `latestStartOnOrBefore` (`:90–120`) is
  already dead today: nothing calls it but its own tests and a `{@link}` in
  `nextStartOnOrAfter`'s doc comment (`:125`), which is reworded. Delete the
  first; §8 replaces the second with `occurrenceIndex`, which is the same
  arithmetic asked the other way round. Their describe blocks in
  `expand.test.ts` (`:79`, `:139`) go. `DayView.tsx:20` loses the
  `OccurrenceDependency` type import.

### 3b. Occurrence status

- **`src/client/occurrences.ts`** — delete `OccurrenceStatusCode`, `status` from
  `OccurrenceRow` and from the select column list (`:82`), the `?? null` mapping
  (`:97`), and `setOccurrenceStatus()` (`:185`, ~30 lines). Note what that last
  one takes with it: its null branch is also the only code that garbage-collects
  an `event_occurrence` row holding nothing else. Rows are still written by
  `cancel` and `override`, so nothing breaks — and `clearOccurrenceOverride`
  (`:233`) already leaves such empty rows behind today, so the app has never
  relied on the cleanup being complete. If a later change wants it back, it
  has to be rebuilt rather than found.
- **`src/domains/occurrences/`** — `OccurrenceState.status` and the
  `OccurrenceStatusCode` re-export (types), the `'status'` change kind and its
  dispatch (mutations `:40,:80,:98`), its patch arm (patches `:32`), and
  `if (o.status) entry.status = …` (transformers `:37`). The tests pinning
  "a day carrying nothing the app shows gets no entry" need re-checking against
  the narrower `OccurrenceState` — the rule survives, its inputs change.
- **`src/services/recurrence/status.ts`** — `isOccurrenceDone` loses its only
  remaining input here, and its other one in §7. It goes entirely.
- **`src/components/OccurrenceSheet.tsx`** — delete the `STATUSES` constant
  (`:42`), `statusOptions`, `setStatus()`, and the `statusRow` button block;
  drop `.statusRow` / `.statusBtn` / `.statusOn` from its CSS module.
- **`src/types.ts`** — drop the `OccurrenceStatusCode` re-export.

### 3c. A freeform `metadata` column on events and occurrences

**Decision:** both `event_series` and `event_occurrence` gain
`metadata jsonb not null default '{}'::jsonb`. This is the house pattern already
used by `note.metadata` (`0001:181`, "pressure-valve for structured extras") and
in spirit by `user_preference.prefs`. It is a place for things the schema has no
column for, added now so it exists when something needs it.

- **Nothing is written into it by this change.** In particular the old
  `status` / `default_status` values are **not** folded into it before their
  columns are dropped — they go with the columns. Preserving them would invite
  keeping the code that reads them, and the point of §3b is that no such code
  survives. Every row starts with `{}`.
- **Name:** `metadata`, for consistency with the existing precedent. `data`
  would work equally; precedent is the only argument.
- **The app neither reads nor writes it** in this change. That is safe by
  construction: `saveSeries` upserts a named column list, and
  `writeOccurrenceRow` (`client/occurrences.ts:148`) does a partial `update` on
  an existing row, or an upsert of only the named fields on a new one. Either
  way `metadata` survives every app write untouched. Surfacing it through
  `Series` / `OccurrenceState` is a later change, when something needs to read
  it.
- **`database.types.ts`** picks it up on regeneration (§5) — no hand edit.

### Database — folded into migration `0022`

- `alter table event_series add column metadata jsonb not null default '{}'::jsonb;`
  and the same on `event_occurrence`. No data is written into either.
- `drop table occurrence_dependency;` (its RLS, index and `0008` publication
  membership go with it; `0011` left it at default replica identity, so there
  is nothing else).
- `alter table event_occurrence drop column status;` and
  `alter table event_series drop column default_status;` — both must be dropped
  as *columns* explicitly; dropping the lookup table with `cascade` would remove
  the FK constraints but leave the columns behind.
- `drop table occurrence_status;` — after the three referencing columns are gone.
- `supabase/seed.sql` needs no change here — it seeds no dependencies and no
  statuses.

**Checked and clear:** `supabase/functions/send-reminders` selects only
`series_id, occurrence_start, rescheduled_to, cancelled` from `event_occurrence`
(`index.ts:174`). Push reminders are unaffected by the status removal.

`event_occurrence` ends this plan as
`series_id, occurrence_start, rescheduled_to, rescheduled_duration, cancelled, attendees, metadata`
— sparse overrides (timing, removal, people — §10), nothing else.

---

## 4. The SQL functions in `0022`

Three are recreated and one is dropped. Two rules for the migration as a whole:

- **Order: drop the old functions, change the schema, create the new ones.**
  SQL-language bodies (`search_events`) are parsed against the schema at
  `create` time, so creating them last makes the migration check itself.
  plpgsql bodies (`create_account`, `handle_new_user`) are **not** — they fail
  only when called.
- `search_events` changes its `returns table (…)` signature, so it needs an
  explicit `drop function` before the `create` (§2).

**`split_series`** — `drop function split_series(uuid, timestamptz, text);`
(§9). It was recreated in `0003`, `0010` and `0017`; all three definitions are
history once this lands. Its `grant execute` goes with it. It must be dropped
*before* the tables and columns: it is plpgsql, so `drop table … cascade` does
not take it, and its body reads `default_status`, copies `note` /
`checklist_item` / list-link rows and updates `occurrence_dependency`
(`0017:54–58`, `:142–145`) — a survivor would fail at first call.

**`search_events`** — with notes (§2) and checklists (§7) gone there is nothing
to aggregate, so the `docs` CTE and both `left join`s collapse. The body becomes
a direct query on `event_series`: same `websearch_to_tsquery` + escaped-`ilike`
fallback, applied to `title` alone; `returns table` loses `snippet`; ordering
and the `limit 50` stay. **Re-grant it after the `create`:**

```sql
grant execute on function search_events(uuid, text) to authenticated;
```

`0017`'s `create or replace` kept the grant from `0014:126`; a plain `create`
after a `drop` does not, and the default privileges for functions created by
the migration role are execute for `postgres` only (`0004` sets defaults for
tables and sequences, not functions — the comment at `0019:64` saying
otherwise is wrong). Without the grant, search fails with a permission error
for every signed-in user. `create_account` stays a `create or replace` and
keeps its grant; `handle_new_user` runs from a trigger and needs none.

**`create_account`** — from `0015`: the `account_member` insert loses `role`;
the `person` insert writes `color_key` instead of `color` and loses `kind`
(§6c, §6d, §10).

**`handle_new_user`** — from `0017:165`: becomes
`insert into app_user (id) values (new.id) on conflict (id) do nothing` (§6c).

With the split gone, nothing in `0022` can fail silently at runtime except the
two plpgsql bodies above, and both are exercised by signing up a new user —
which is in the verification list for exactly that reason.

---

## 5. Cross-cutting cleanup

- **`src/client/database.types.ts`** (1,167 lines) is the generated `Database`
  type behind `createClient<Database>` (`supabase.ts:14`). It describes every
  table, column, lookup and function this plan removes, knows nothing of the
  new `metadata` columns, `repeat_count` or `event_occurrence.attendees`, and
  still calls `person.color` by its old name.
  Regenerate it against the migrated local stack
  (`supabase gen types typescript --local`) rather than hand-editing — there is
  no npm script for this today, so the command goes in the commit message or a
  new `package.json` script.
- **`src/queryClient.ts`** — bump `CACHE_BUSTER` once for the whole strip. Every
  removed mutation key would otherwise silently drop a write that was paused
  offline under it.
- **Docs.** `README.md`, `docs/STATUS.md`, `docs/DATA_MODEL.md`,
  `docs/PLANNED.md` and `docs/RESTRUCTURE_PLAN.md` all describe lists, notes,
  dependencies, status, checklists and the split as built features; each needs
  its claims cut to match. Specifically stale: the README's "238 tests"
  (`:167`; the suite runs 219 today) and its seed description ("a few events
  (one weekly with two checklists), two lists and a blueprint", `:68–70`,
  repeated verbatim in `STATUS.md:250–252`); `STATUS.md`'s smoke test
  (`:316–320`, which names `occurrence_item_state`, `split_series`, ticks and
  "owner" membership); its gotchas about FK hints (`checklist_item` is gone,
  and the remaining embeds are single-FK), about children-sync cascades "wiping
  ticks" (no ticks), about note authorship, and both of its "easy to break"
  rules — the `COUNT` one is rewritten by §8 and the `split_series` cutover
  one goes with §9; and its claim that the checklist round-trip is the suite's
  most valuable test. `DATA_MODEL.md` Decisions 2, 3 and 4 are rewritten by
  §8 and §9; Decision 1
  (`:97–104`) and the type map at `:420` still describe `event_participant`
  as the roster and go stale with §6a. `DATA_MODEL.md` has no "people as
  data" section — the phrase is one row of its migrations table (`:444`), and
  the supervision-and-lanes rationale for the person model exists only in the
  header of `0005_person.sql`. The migration header is history and stays; the
  doc gains a short people section under §10 rather than having one rewritten.
- **`docs/NOTE_MODEL.md` is not touched.** It is a design for work that comes
  *after* this cleanup, not documentation of the `note` table being removed
  here. Leave the file and the README's link to it exactly as they are. Removing
  today's note attachments does not contradict it — it clears the ground.

---

## 6. Dead and vestigial structure — remove

Groups the schema carries and the app never uses. Established by checking every
`.from('…')` / `.select('…')` in `client/` and in the reminder sender against
the schema: nothing below is read or written by any live path, except where a
write is named so it can be removed.

### 6a. The dead roster model

`0005` replaced the original user-keyed roster with `person` / `event_person`,
and the original stayed behind. Drop `event_participant`,
`occurrence_participant_override` and `participation_requirement`, then their
lookups `rsvp_status` and `participant_role`. RLS policies go with the tables;
none is in the realtime publication. **App code: nothing to change** — no
reference exists. The only SQL that touched them was `split_series`, which is
dropped (§9).

### 6b. Unused checklist machinery

Subsumed by §7. The columns this group originally named —
`checklist_item.occurrence_start` and `.required`,
`occurrence_item_state.status` and `.completed_at` — go because their tables go,
and `occurrence_item_removed` and the `item_status` lookup go with them. Three
of the four columns are *not* unused today, contrary to this section's
heading: `required` is written (`series.ts:319`), `occurrence_start` is
selected, filtered and written (`series.ts:142`, `:176`, `:320`), and
`occurrence_item_state.status` is read and written (`occurrences.ts:116`,
`:284`). Only `completed_at` and `occurrence_item_removed` are untouched by
app code. They are listed here for the schema inventory; §7 removes their
readers and writers.

### 6c. Vestigial columns

Each is a `drop column` plus the one place that writes it.

- **`event_series.timezone`** — never written; the sender reads
  `user_preference.prefs.timezone` instead.
- **`event_series.template_id`** — written on new-from-template, never read;
  its index goes with it. App: `saveSeries` loses the `templateId` option and
  the `template_id` spread (`series.ts:205`, `:217`);
  `domains/events/mutations.ts:73` stops passing `fromTemplateId`, and that
  field leaves the `saveEvent` change. **The editor's own `templateId` state
  (`EventEditor.tsx:202`) stays** — it chooses which template's people and
  reminders are copied into the draft; only the stored provenance goes. Its
  comment at `:200–201` says the value is "written to the series'
  `template_id`"; reword. The `templateId` doc comment at `series.ts:198–199`
  goes with the option.
- **`event_series.split_from_id`** — set only by `split_series`, which is
  dropped (§9); never read. `event_series_split_from_id_idx` goes with it.
- **`app_user.display_name`** — never read. `handle_new_user` is recreated to
  insert only `id` (§4). `seed.sql:39` sets it in auth metadata; harmless, but
  drop it for tidiness.
- **`account_member.role`** — set `'owner'` once, never consulted;
  `is_account_member` (`0002:11`) checks membership only. `create_account` is
  recreated without it (§4), and **`seed.sql:69` inserts it too** — drop the
  column from that insert's list, or `supabase db reset` fails on the first
  run after `0022`.
- **`reminder.method`** and the **`reminder_method`** lookup — always `'app'`,
  ignored by the sender, and `push` / `email` are never sent by anything.
  `syncReminders` (`series.ts:371`) stops writing it; `seed.sql:148` drops it.
  Column first, then the lookup.
- **`notification_log.dismissed_at`** — never written. Drop.

With `occurrence_status` (§3b), `item_status` (§7) and these, **every
enum-as-table lookup is gone**. The one remaining enumeration, the
`person.kind` check constraint, goes in §10 — after this plan the schema has
none.

### 6d. Rename `person.color` → `person.color_key`

The column has held a palette key `'1'`–`'12'` since `0015` but kept its
hex-era name, while `event_series.color_key` says what it is.
`alter table person rename column color to color_key;`. App: `client/people.ts`
— the select (`:48`), the mapping (`:55`) and `recolorPerson`'s update (`:74`).
`create_account` (§4) and `seed.sql:79` insert `color_key`. **The app-side
`Person.color` field keeps its name in this pass** — the type lives in
`client/people.ts:20–32`, and renaming the field to `colorKey` would ripple
through `domains/people/patches.ts:21`, `domains/people/selectors.ts:92`, the
`people.test.ts` fixtures and the doc comment at `client/preferences.ts:25`.
(`domains/people/mutations.ts` reads the *change's* `color` field and
`domains/preferences/patches.ts` never touches `Person.color`; neither needs
to move.) Worth doing, as its own commit.

---

## 7. Checklists — remove entirely

**Decision:** event checklists go completely — the attachment kind, the editor,
the per-day ticks, and the tables. With status already gone (§3b) this removes
the last notion of completion from the app; the Context section says so.

### What "attachments" becomes

Once notes (§2) and checklists are gone, `Attachment` is a one-member union —
`reminder` — and the whole attachments layer (`attachments.ts`,
`toAttachments` / `fromAttachments`, `cloneAttachments`, `AttachmentsEditor`)
exists to manage a list with one kind in it. Keeping that shape would be
exactly the leftover plumbing this work is meant to remove, so **flatten it**:

- **`src/domains/events/types.ts`** — `CalendarEvent.attachments: Attachment[]`
  becomes `CalendarEvent.reminders: EventReminder[]`, with
  `EventReminder = { id: string; offset: number }` — the same shape as
  `client/series.ts`'s `SeriesReminder`, so nothing converts. Same on
  `EventTemplate`. `Attachment` and `ChecklistEntry` are deleted, and their
  re-exports in `src/types.ts`.
- **`src/domains/events/attachments.ts`** — delete the module. `reminderOffsets`
  and `hasReminders` are one-liners over `e.reminders`; put them in
  `src/domains/events/selectors.ts` beside `timingOf`, so the domain keeps one
  selectors file. `DayView` (`:17`) and `Settings` (`:9`) import them from
  `attachments.ts` today and re-point; `OccurrenceSheet` already imports from
  `selectors.ts` (`:13`). `hasChecklist` has no consumer at all.
  `cloneAttachments` becomes a `cloneReminders` (fresh ids, three lines) in
  `transformers.ts` for the two template copy paths (`EventEditor.tsx:232`,
  `:262`).
- **`src/services/notifications/alerts.ts`** — reads reminders through a local
  helper (it imports only types from the domains, on purpose); the helper reads
  `e.reminders` instead of filtering `e.attachments`.
- **`src/domains/events/transformers.ts`** — `toAttachments`,
  `fromAttachments` and `GROUP_STRIDE` go; `toEvent` / `toTemplate` /
  `fromEvent` / `fromTemplate` copy `reminders` straight through. In
  `transformers.test.ts` the `toAttachments` and `attachments round trip`
  describe blocks (`:31`, `:92`) go; `toEvent`, `toTemplate`, `back to a series`
  and `patches` stay, but their shared `series()` fixture (`:24–26`,
  `checklist: []`, `notes: []`), the `toTemplate` expectation (`:165`) and
  the `back to a series` fixture (`:172`) are rewritten to the flat shape.
  The same `attachments: []` fixture appears in `expand.test.ts:25` and
  `reminderSenderLogic.test.ts:41`.
- **`src/components/AttachmentsEditor.tsx`** — becomes a `RemindersEditor`: the
  "Remind me" chip row (`:22–33` and its render) is all that survives. The
  `.module.css` goes entirely: it holds no reminder rule (the chips use
  `shared.chips` / `shared.chip`).
- **`src/components/EventEditor.tsx`** — `attachments` state (`:199`) becomes
  `reminders`; `cleanedAttachments()` (`:214`) goes — there is nothing left to
  clean; the doc comment at `:92` still says "attachments, deps".
  **`TemplateEditor.tsx`** the same (`attachments` state `:40`,
  `cleanedAttachments` `:51`).
- **`src/client/series.ts`** — delete `ChecklistLine`, `Series.checklist`, the
  `checklist_item!owner_series_id (…)` embed and the `checklist_item` field on
  `SeriesRow`, the `.filter((c) => c.occurrence_start === null)` mapping
  (`:176`), and `syncChecklist()` with its call. `Series.reminders` stays. The
  FK-hint comment at `:134–139` cites `occurrence_item_removed` and loses its
  reason (the remaining embeds, `event_person` and `reminder`, each have one
  path); the hints can stay.
- **`src/components/Settings.tsx:187`** — the "N checklist items" bit of the
  template summary, and the hint text at `:175` that promises "checklists,
  notes and reminders".

### The per-day ticks

- **`src/client/occurrences.ts`** — delete `ItemStateRow`, `fetchItemStateRows`
  (`:106`) and `setChecklistEntry` (`:263`).
- **`src/domains/occurrences/`** — `OccurrenceState.checked` (types); the
  `'tick'` change kind (mutations `:41`, `:69`, `:83`, `:101` and the
  `setChecklistEntry` import `:17`; patches `:16`, `:37`); `fetchMonth` in
  `queries.ts` (`:63–67`) fetches occurrence rows only and `toCompletions`
  (transformers `:28–31`) takes one argument, losing the `checked` write at
  `:47` and the `ItemStateRow` import. `OccurrenceState` ends as
  `{ start?, duration?, cancelled? }`. The tick cases in `occurrences.test.ts`
  (the `tick` helper `:17–23`, cases `:53`, `:59`, `:137`) go. The
  *completions* name — `CompletionsMap`, `toCompletions`,
  `useCompletionsForRange`, the `'completions'` query key — survives holding
  only moved and cancelled days; renaming it is a separate mechanical commit
  and not part of this plan.
- **`src/services/recurrence/status.ts`** — **delete the module.**
  `isOccurrenceDone` has no inputs left. `occKey` moves to
  `src/services/recurrence/timing.ts` (a leaf: it imports one type), and its
  four consumers re-point: `expand.ts:13`, `alerts.ts:12`, `DayView`,
  `OccurrenceSheet`. **The barrel `src/services/recurrence/index.ts:14`
  re-exports the module** (`export * from './status'`) and its header lists it
  (`:10`); both lines go, or the build breaks. `status.test.ts` goes with it.
  (The domain's own `occurrenceKey` in `domains/occurrences/transformers.ts`
  stays — the two are deliberately separate copies. The comment explaining why
  lives in `status.ts:24–31`, not beside `occurrenceKey`; it travels with
  `occKey` to `timing.ts`.)
- **`src/components/OccurrenceSheet.tsx`** — the checklist block (`:261–292`;
  `:252–259` is the waits-on banner, §3a),
  `cls` / `hasChecklist` / `checked` / `done`, and `doneTitle` on the title;
  `.checklist*` and `.doneTitle` from its CSS module.
- **`src/components/DayView.tsx`** — `checklistEntries`, the `CheckSquare`
  import, the `n/total` badge (`:323–337`), and `isOccurrenceDone` + `s.done` on
  chips and blocks (`:364`, `:437`). **`WeekTimeline.tsx`** — `:10`, `:98`,
  `:244` the same. Drop `.done` from both CSS modules.
- **`src/domains/index.ts`** — the `checklist_item` and `occurrence_item_state`
  cases; `domains.test.ts:13` and `:23`.
  `src/services/realtime/realtime.test.ts:41`, `:47` drive a realtime change
  for `'checklist_item'`; once `queryKeysForTable` returns nothing for it the
  test needs a surviving table.
- **Comment residue** naming ticks, checklists or attachments, for the same
  pass: `domains/events/types.ts:8–10`; `client/series.ts:2–3`, `:39–47`,
  `:251`, `:256`; `client/occurrences.ts:1–8`, `:144`, `:216`, `:232`,
  `:249`; `domains/occurrences/types.ts:4–7`, `:20–21`, `:39`;
  `domains/occurrences/selectors.ts:10`; `DayView.tsx:316`;
  `OccurrenceSheet.tsx:44–47`. `.doneToggle` in `OccurrenceSheet.module.css`
  (`:67–79`) is already unused.

### Database — folded into migration `0022`

- `drop table occurrence_item_state, occurrence_item_removed, checklist_item cascade;`
  then `drop table item_status;`. RLS, indexes, `0011` replica identity and the
  `0006` / `0016` publication membership go with them.
- `search_events` — the `checklist_item` join goes; the function collapses to a
  title search (§4).
- `supabase/seed.sql:131` — the checklist insert block.

---

## 8. A user-facing end for a series — add

**What the app must be able to say:** "12 piano lessons every other Tuesday"
and "every Monday morning eat a fish from now until Christmas". The first ends
after a count, the second on a date. Today neither is expressible: a series
only ends by being split or deleted forward, and `until` is not a form field.

**Decision:** the editor gets an **Ends** control — *never* / *after N times* /
*on a date* — and the model gains one column for the count,
`event_series.repeat_count integer` (`null` = not count-bounded). The date end
is the existing `until`, promoted from a system-only cap to something the user
sets and sees.

### Why a column and not `COUNT=` in the rrule

`DATA_MODEL.md` Decision 2 banned `COUNT` because a verbatim copy of the rule on
a split would restart the count on the new half. With the split gone (§9) that
reason no longer exists, and either encoding would work. A column is chosen
because it leaves everything at the string boundary untouched —
`rruleToRecurrence` / `recurrenceToRRule` on the client and the sender's
hand-rolled `parseRRule` — and lets SQL see the count without parsing anything.
Rewrite Decision 2 to say: *the string is `UNTIL`-or-infinite; a count lives
beside it in `repeat_count`; a series ends at whichever comes first.*

### Semantics — decided once, applied everywhere

- **The weekday comes from the start date.** "Every other Tuesday" is *weekly,
  every 2*, anchored on a Tuesday; "Monday morning" is *weekly*, anchored on a
  Monday at that time. The model already works this way and needs no `BYDAY`;
  what it lacks is saying so back — see `recurrenceLabel` below.
- **The count counts slots, not survivors.** A cancelled occurrence is one of
  the N; it does not extend the series. Anything else makes a series' end
  depend on per-occurrence state, which the sender and every view would each
  have to reproduce.
- **A month without the day is not a slot.** A monthly series anchored on the
  31st produces nothing in February (`startsOn` skips it, `expand.ts:77`). If
  `occurrenceIndex` were plain `months / n`, that missing month would consume
  one of the N and "12 lessons on the 31st" would yield fewer than 12. So the
  monthly index counts *produced* months only: walk `k = 0 … months / n` and
  count the ones whose day exists (at most a few dozen steps). Daily and
  weekly need nothing — every grid step is a slot. This matches RFC 5545's
  `COUNT`, which counts instances; the "slots" rule above is about
  cancellations, which are instances the user saw. Both `expand.ts` and the
  sender's `logic.ts` implement the same walk, and the cross-validation test
  gets a Jan-31 counted case so they cannot drift.
- **`until` is one thing: the last day the series produces an occurrence, and
  only the user sets it.** Nothing else writes it once the split (§9) and
  "delete this and future" (§9) are gone. The editor sets exactly one of
  `until` / `count` and clears the other; expansion still treats both-set as
  "whichever comes first", purely as a defensive rule for rows written before
  this change.

### App code

- **`src/client/series.ts`** — `Recurrence` gains `count?: number`. `SeriesRow`
  and `SERIES_SELECT` gain `repeat_count`; `fetchSeries` builds `recurrence` as
  the parsed rrule plus `count` when the column is set (dropping the count if
  `rruleToRecurrence` returned undefined for an unmodelled rule). `saveSeries`
  writes `repeat_count: series.recurrence?.count ?? null`.
- **`src/services/recurrence/expand.ts`** — the one place the client evaluates
  where a series ends. Add `occurrenceIndex(e, date): number | null` — the
  zero-based position of `date` on the grid, or null off-grid: `delta / n`
  (daily), `delta / 7n` (weekly), and for monthly the produced-month count
  above. This is the arithmetic `latestStartOnOrBefore` does today
  (`:90–120`); that function is already dead, so replace it. `delta` is safe
  across DST: `diffDays` is a calendar-day difference (`dates.ts:25–29`) and
  the sender is pure UTC. `startsOn`
  becomes: on-grid, not past `until`, and `count == null || index < count`.
  `nextStartOnOrAfter` gets the matching early exit so an ended counted series
  returns null in a few steps rather than after its five-year scan.
  `recurrenceLabel` takes the event rather than the bare rule, so it can name
  the weekday for weekly rules and the end: "Every 2 weeks on Tuesday ·
  12 times", "Every week on Monday · until 25 Dec". Read back in the sheet's
  meta line, that label *is* the sentence the user had in their head — which is
  the check that the model expresses it. Its two consumers
  (`WeekCalendar.tsx:269`, `OccurrenceSheet.tsx:228`) both have the event in
  scope; `expand.test.ts:159–165` calls it with bare rules and is updated.
- **`src/components/EventEditor.tsx`** — an **Ends** control in the repeat row
  (`:476`), shown when `repeat !== 'none'`: a select `Never` / `After…` /
  `On…`, with a `NumberField` (min 1) for the count or a date input for
  `until` whose `min` is the **series anchor** (`eventDate(base)`), not the
  editor's `date` state — that state holds the *opened occurrence's* day when
  the editor comes from a sheet (`:167`, `:179`), and a user must be able to
  end a series before the occurrence they opened, since that is what replaces
  "delete this and future" (§9). Form state is seeded from `base.recurrence`,
  and `buildEvent` (`:272`; the `recurrence:` key at `:278`) writes exactly
  one of `count` / `until` from the choice.
  The preserve-`until` spread and its comment (`:284–287`) go: the field now
  round-trips through the form like every other. `TemplateEditor` is
  unaffected: templates carry no recurrence.
- **`supabase/functions/send-reminders`** — `SenderSeries` and the select at
  `index.ts:157` gain `repeat_count`; `logic.ts`'s `Recurrence` gains `count?`;
  its `startsOn` gets the identical index check (its monthly arithmetic is
  already the UTC twin of the client's). `parseRRule` is untouched — the count
  is not in the string. The join is in `computeDueReminders`, which builds
  the rule with `parseRRule(s.rrule)` (`logic.ts:238`); that becomes
  `{ ...parseRRule(s.rrule), count: s.repeat_count ?? undefined }`. This one
  line is exactly what the cross-validation test does *not* cover — it calls
  `startsOn` with prebuilt `Recurrence` objects — so it gets its own case in
  `reminderSenderLogic.test.ts`: a counted series with a reminder due past its
  last slot, run through `computeDueReminders`, yields nothing.
- **`src/client/reminderSenderLogic.test.ts`** — extend the `rules` array
  (`:20`) with counted cases (daily × 3, weekly × 5, monthly × 2, and one with
  both `until` and `count` for each side of whichever-first), so the property
  "sender `startsOn` ≡ client `startsOn`" pins the new rule. This is the test
  that matters: it fails if the sender pushes a reminder for a sixth lesson the
  calendar doesn't show.
- **`src/services/recurrence/expand.test.ts`** — add `occurrenceIndex` and
  counted-`startsOn` cases, including the whichever-first pair.

### Database — folded into `0022`

- ```sql
  alter table event_series
    add column repeat_count integer check (repeat_count > 0),
    add constraint repeat_count_needs_rule
      check (repeat_count is null or rrule is not null);
  ```
  — a count on a one-off is meaningless and should not be storable.
- `seed.sql` — seed one counted series ("Piano lesson", weekly × 5) and one
  dated one, so every screen has both to look at. The `event_series` insert's
  column list (`:96`) gains `repeat_count`.

### Docs

`DATA_MODEL.md` Decision 2 as above. `STATUS.md`'s rule "never store a COUNT
rrule" stays true and gains the sentence about the column.

---

## 9. The series split — remove

**Decision:** an edit goes to the whole series or to one occurrence, and to
nothing in between. The "this and following" edit, the `split_series` RPC that
implements it, and the "this and future" delete scope all go. It is rarely if
ever used, and it is the single most intricate piece of SQL in the schema.

### What goes

- **`src/components/EventEditor.tsx`** — `saveThisAndFollowing` (`:338–357`)
  and the "This and following events" choice in the save scope sheet (`:538`).
  The sheet keeps two choices: **This event only** → `saveThisOccurrence`
  (an `override` on that day), **All events** → `saveAllEvents` (the series
  row). `ScopeSheet` itself stays; two choices is still a scope.
- **`src/components/OccurrenceSheet.tsx`** — `deleteThisAndFuture` (`:133`),
  the "This and future events" delete choice (`:150`), and the
  `isFirstOccurrence` collapse logic (`:111`) that existed only to hide it on
  the first slot. Delete keeps two choices: **This event only** (`cancel`) and
  **All events** (`removeEvent`). This one you did not name; it is removed on
  the principle you stated — it is neither the series nor an occurrence — and
  because §8 gives the same result as an ordinary edit: *Ends → on <the day
  before>*. Easy to keep if you want it.
- **`src/domains/events/mutations.ts`** — the `'split'` change kind (`:44`),
  its case (`:83–95`, which is also where the `checklist: _c` omit lived) and
  its no-op optimistic patch (`:106`).
- **`src/client/series.ts`** — `splitSeries` (`:260`) and the `Omit<Series, …>`
  it takes.
- **`src/client/rrule.ts`** — `truncatedRRule` (`:48–56`); its describe block
  in `rrule.test.ts:57`. `occurrenceTs` in `mappers.ts` stays — the occurrence
  writes use it.
- **Database** — `drop function split_series(uuid, timestamptz, text);` (§4).
  `event_series.split_from_id` is already dropped in §6c; its only writer was
  this function.

### Also made redundant

- **`repeating()` in `src/domains/events/selectors.ts:45`** — "the events that
  repeat, which are the only ones that can be split". It already has no
  consumer; its stated purpose is the split. Delete.
- **The legacy-`UNTIL` decoding.** `rruleToRecurrence` (`rrule.ts:77–82`) and
  the sender's `parseRRule` (`logic.ts:50`, `:73`) both rewind an `UNTIL`
  instant by ten hours before taking its date, to tolerate values an earlier
  build wrote as the writer's *local* 23:59:59. The only code that ever wrote
  `until` was the split and the forward delete, and the forward delete
  (`e1ba172`) landed *after* the encoding fix (`608bcd7`), so a legacy value
  can exist only from a split performed between `bc32803` and `608bcd7`.
  Check the hosted
  project once — `select id, rrule from event_series where rrule ilike '%UNTIL%'`
  — and if every `UNTIL` ends in `T235959Z`, or there are none, delete the
  rewind from both implementations and the "decodes a legacy locally-encoded
  UNTIL" case in `reminderSenderLogic.test.ts:88`. If a legacy row turns up,
  re-encode it in `0022` with one `update` and delete the rewind anyway. §8
  writes `until` through `recurrenceToRRule`, which uses the UTC encoding, so
  nothing new will ever need it.
- **Comments that explain things by the split.** `expand.ts:63` ("a capped
  series (split lineage)…") and `:122–129` (which explains `until` as a cap
  and links `latestStartOnOrBefore`); `domains/events/patches.ts:8` ("there
  is deliberately nothing here for splitting…"); `EventEditor.tsx:51–56` (the
  `EditorTarget` doc); `assets/ui/ScopeSheet.tsx:13–17` ("three-way
  question"); `rrule.ts:9–13` ("later split / expand work"); and
  `domains/events/mutations.ts:139`, where the `onSettled` invalidation is
  justified by "a split changes both halves and moves rows between them". The
  invalidation stays — the optimistic patch is a guess and the server's row is
  the truth — but the stated reason has to change, because wrong reasons are
  how the next reader re-learns that the split exists.
- **Imports left dangling.** `client/series.ts:21` imports `truncatedRRule`;
  `domains/events/mutations.ts:14–20` imports `splitSeries`, and its
  `Recurrence` / `SeriesTiming` imports become unused with the `'split'`
  kind. The compiler finds these; listed so nobody wonders.
- **Not redundant, and worth saying so:** `SeriesTiming` (`client/series.ts:102`)
  and `occurrenceTs` / `dayRange` (`client/mappers.ts`) are shared with every
  occurrence write;
  `can_access_series` in `0002` gates the RLS of every series-owned table; and
  the editor's scope sheet still has two real choices. All stay.

### The consequence, and why it is fine

With no split, "All events" edits a live series' row in place — including, now
that §8 exposes them, its cadence and end. `DATA_MODEL.md` Decision 4's
corollary says never to do that "in a way that shifts the grid", because the
per-day rows are keyed by the original slot and could be orphaned. That is
exactly what happens, and it is harmless:

- an `event_occurrence` row for a day the rule no longer produces is fetched
  (the month query pulls every row in the window, `client/occurrences.ts:85`)
  but never *matched*: pass 2 of `occurrencesOnDate` looks up only days
  `startsOn` produces, pass 1 already discards a relocated row whose origin is
  off-grid (`expand.ts:228–230`), `alerts.ts:101` guards with `startsOn`, and
  the sender walks on-grid days only (`logic.ts:247`). So it is inert;
- inert, that is, **until the grid returns to that day.** Rows are keyed by
  day, not by slot: cancel Tuesday 10 March on a weekly series, edit the
  series to daily, and the new daily occurrence on 10 March inherits the old
  `cancelled` row and is hidden; edit back and the orphan revives. This is the
  price of editing in place and it is accepted — an occurrence *is* "the one
  on this day" — but `DATA_MODEL.md` Decision 3 says it out loud;
- it goes with the series on delete (cascade);
- a *time* change on the same days keeps every row findable, because rows are
  matched by day range, not exact timestamp (the gotcha that already exists for
  this reason).

`saveAllEvents` already refuses to move the series' anchor *date* ("out of
scope", `:361`); that restriction stays as it is.

### Docs

`DATA_MODEL.md` Decision 3 is rewritten: no split, no temporal versioning; a
series is edited in place, per-day rows are sparse overrides keyed by the
original day, and an override for a day the rule no longer produces is inert
until the rule produces that day again. Decision 4 loses its "goes through
`split_series`" corollary. The split is also named in the entity map (`:53`),
Decisions 5, 6, 8, 9, 10 and 12, and the migrations table; §5's doc pass
sweeps those. `STATUS.md` loses
the "cutover must be a real `occurrence_start`" rule. The header comment in
`0003_functions.sql` is history and stays as it is.

---

## 10. Adults and children — remove; per-occurrence people — add

**Decision:** there is no kind of person. A series has one or more people, an
occurrence can override that list, and nothing else follows from who is on an
event — no supervision check, no clash or needs-attention badge, no merged
block, no narrow lane, no special label, no special default.

### What is actually left of the distinction

Less than the comments claim. `isAllAdultsFor` has no consumer except the
label, so the merged "Both" block is not rendered anywhere; and the lane grid
is `repeat(3, minmax(0, 1fr))` in CSS with no inline override, so the "narrow
child lane" the CSS comment describes does not exist either. What remains:

- **`src/services/conflicts/index.ts`** — the whole module (`childStatuses`,
  `ChildStatus`, `Busy`). Delete; its one consumer is `DayView.tsx:26` and it
  has no test file.
- **`src/components/DayView.tsx`** — the `coverage` / `statuses` computation in
  `pages` (`:156–163`), `hasWarnings` and the `rightExtra` alert badge on the
  header (`:170`, `:196`), the `status` prop threaded through `AllDayChip`, the
  `badges()` helper (`:317`) and `Lane` (`:384`), the `clash` / `needs` icons
  and classes (`:339–340`, `:371–372`, `:448–449`), and the `AlertTriangle` /
  `CircleDashed` imports. `peopleById` (`:59`) has no other reader and goes,
  taking the `byId` import with it. CSS: `.alertBadge`, `.warnClash`,
  `.warnNeeds` (`:81–91`, `:274–283`) and the comment above them at `:273`
  ("Conflict markers on Nora's blocks"); `.warnKey.*` (`:95–99`) is already
  unreferenced.
- **`src/domains/people/selectors.ts`** — delete `adults`, `children`,
  `involvesChildFor`, `isAllAdultsFor`. `attendeeLabelFor` becomes names
  joined with " + ", nothing else; `defaultAttendees` becomes the first person
  in lane order. In `people.test.ts` the `adults / children`,
  `involvesChildFor` and `isAllAdultsFor` describe blocks go; the
  `attendeeLabelFor` and `defaultAttendees` cases are rewritten to the simpler
  rules, and the `person()` fixture (`:20–27`) loses its `kind` argument.
  `attendeeLabelFor`'s other consumer, `Settings.tsx:185`, is unaffected.
- **`src/client/people.ts`** — `PersonKind`, `Person.kind`, `kind` in the
  select and the `p.kind === 'child'` mapping; the doc comments about lanes
  and supervision. `Person` ends as `{ id, name, color, sortOrder }`.
- **`src/domains/people/types.ts`** — the `PersonKind` re-export; and in
  `src/types.ts`.
- **The lane grid, while it is open.** `DayView.module.css:110` and `:149`
  hardcode three columns, so a fourth person wraps to a second row and two
  people leave an empty third. Set `grid-template-columns` from `people.length`
  (a `--lanes` custom property on the container is enough) and delete the two
  stale "Nora's lane is narrower" comments. Equal lanes, however many.

### Database — folded into `0022`

- `alter table person drop column kind;` — the check constraint goes with it.
- `create_account` (§4) stops inserting `kind`; `seed.sql:79` drops the column
  from its person rows and the comment above it ("so supervision checks and the
  Both label have something to work with").

### Per-occurrence people — add

The roster model already has the series half (`event_person`) and the sparse
per-day row (`event_occurrence`). The override is one nullable column on that
row, in the same style as a timing override: absent means "as the series".

- **Database** — `alter table event_occurrence add column attendees uuid[];`
  `null` = inherit the series' people; an array = exactly these people on this
  day. An array carries no foreign key, so a person deleted later would leave
  a dangling id; the read side already tolerates unknown ids (`byId` lookups,
  the `?` in `attendeeLabelFor`), and the app has no delete-person path today.
  A junction table would give the FK back at the cost of a second windowed
  query and a merge — exactly the shape §7 just removed for ticks — so the
  column wins.
- **`src/client/occurrences.ts`** — `OccurrenceRow.attendees: PersonId[] | null`,
  `attendees` in the select (`:82`). Two writes: `setOccurrenceAttendees(series,
  date, attendees)` through `writeOccurrenceRow`, and
  `clearOccurrenceAttendees(series, date)` as an `update … set attendees = null`
  by day range, never an insert — the same shape as `clearOccurrenceOverride`
  (`:233`), so clearing a day that has no row stays a no-op.
- **`src/domains/occurrences/`** — `OccurrenceState.attendees?: PersonId[]`
  (types); `toCompletions` copies it when non-null (transformers); two new
  `OccurrenceChange` arms, `{ kind: 'attendees'; attendees }` and
  `{ kind: 'clearAttendees' }`, with their `patchEntry` cases mirroring
  `override` / `clearOverride` (patches); their dispatch in mutations. Realtime
  needs nothing — same table, same `completionsPrefix` invalidation. Cases in
  `occurrences.test.ts` for both directions.
- **`src/services/recurrence/expand.ts`** — `effectiveOccurrence` applies
  `ov.attendees` alongside `start` / `duration` — **including in its early
  return** (`:30`, `if (!ov || (ov.start == null && ov.duration == null))
  return event`), which must also test `ov.attendees` or a people-only
  override is silently ignored. `maxEffectiveSpan` (`:52`) skips on the same
  condition and can stay: attendees do not change the span. `DayOccurrence`
  gains `attendees: PersonId[]` set from the effective event in both passes of
  `occurrencesOnDate`. Its doc comment ("the series `id`, roster and
  attachments are untouched") is rewritten: roster is exactly what now changes.
- **Readers switch from the series' list to the occurrence's.** Every
  `o.event.attendees` / `ev.attendees` on a `DayOccurrence` becomes
  `o.attendees`: `DayView.tsx:224`, `:415`, `:436`, `:471`;
  `MonthView.tsx:202`; `WeekTimeline.tsx:101`, `:256`; `WeekCalendar.tsx:254`,
  `:268`. The editor's `base.attendees` (`EventEditor.tsx:194`) stays the
  series' list — it edits the series.
- **`src/components/OccurrenceSheet.tsx`** — the meta line (`:227`) shows the
  effective people; below it a **People** row using the existing
  `AttendeeChips` bound to the effective list, whose change writes
  `attendees`; and, when the day is overridden, a "Reset to series people"
  action beside it — the same pattern as the existing "Reset to series time"
  paragraph. `AttendeeChips` already refuses an empty selection, so an
  occurrence can never override to nobody.
- **`src/components/EventEditor.tsx`**, `saveThisOccurrence` (`:322`) — today
  it writes timing only (`:326–335`) and silently drops any change to the
  people chips. It should also write `attendees` when the form's list differs
  from the series', so "This event only" means the whole form, not half of it.
  For that to be right the form must **start from the effective list**: the
  chips are seeded from `base.attendees` (`:194`), the series' roster, so on a
  day that already carries an override the editor would show the wrong people
  and, on save, either clear the override or rewrite it from stale input. When
  the editor is opened for an occurrence (`occurrenceDate` set), seed the
  chips from that day's effective attendees and compare against that list;
  and when the form's list equals the series' roster again, write
  `clearAttendees` rather than an array that happens to match.
- **Reminders are unaffected.** A `reminder` row belongs to a user, not to an
  attendee, and neither the sender nor `alerts.ts` consults who is on the
  event.
- `seed.sql` — one occurrence with a different set of people, so the override
  is visible on a fresh reset. This is the first `event_occurrence` row the
  seed writes; its `occurrence_start` must be a day the series' rule produces.

### Docs

`DATA_MODEL.md` gets a short people section — it has none today (§5): `person`
+ `event_person` as the roster, the occurrence override, no kinds; the README's feature list drops
"per-person colours" as a headline only if it also drops the rest of the
paragraph it sits in.

---

## Verification — run locally, in your dev environment

These are the checks worth running against the local Supabase stack, in this
order. Nothing here is run as part of producing the change.

1. `npm run typecheck` — the `Attachment` → `reminders`, `OccurrenceState` and
   `Recurrence` changes turn most of this into compile errors, so a clean pass
   is real evidence.
2. `npm test` — the removals take out all 24 cases in `lists.test.ts`, all of
   `status.test.ts`, the two attachment describe blocks in
   `transformers.test.ts`, the `truncatedRRule` block in `rrule.test.ts`, and
   the tick and dependency cases in `occurrences.test.ts`, and three cases in
   `domains.test.ts`. Don't chase a target
   number: the repo's own docs already disagree with each other (`README.md`
   says 238, `docs/STATUS.md` says 219), so whatever the suite prints after this
   work is the figure to write back into both. The one test to watch is the
   sender-vs-client cross-validation, extended by §8.
3. `supabase db reset` against the **local** stack — this applies `0022` to a
   fresh database and, because `search_events` is SQL-language, validates that
   function's body on the way — then click-test the paths no test covers:
   - open an occurrence sheet — title, time, people, reminders, Edit and
     Delete, and nothing else: no to-dos, no waits-on, no status buttons, no
     checklist;
   - create an event with two reminders, edit it, reload — `saveSeries` without
     `syncChecklist` / `syncNotes`, and the flattened `reminders` round trip;
   - move one occurrence and cancel another, then reload — the reduced
     `event_occurrence` row;
   - put something in a row's `metadata` by hand in Studio (`:54323`), then
     edit that event's title and move that occurrence from the app, and check
     the value is still there — proves the app's partial writes leave the bag
     alone;
   - edit a recurring event from one of its occurrences — the scope sheet
     offers exactly two choices, and so does Delete;
   - on a series with one moved occurrence, choose "All events" and change the
     time — the moved one stays moved (day-range matching, §9);
   - start a new event **from a template** and confirm its people and reminders
     arrive in the draft — proves the editor's copy still works with the stored
     `template_id` provenance gone (§6c);
   - search for a word in a title — found, with no snippet line;
   - set a reminder a few minutes out and leave the tab open — the in-app alert
     still fires, which is `alerts.ts` reading the flattened field;
   - recolour a person in Settings and reload — the `color_key` rename (§6d);
   - sign up a brand-new user through Inbucket (`:54324`) and create an account
     — exercises the recreated `handle_new_user` trigger and `create_account`,
     the only plpgsql left in `0022`;
   - create "Piano lesson", weekly, ends after 5 — the Month view shows exactly
     five and the sixth week is empty (§8);
   - cancel the third lesson — still five slots, one cancelled, not six;
   - put a reminder on it and run `supabase functions serve send-reminders`
     with the clock past the fifth — nothing is queued for a sixth;
   - create "Eat a fish" on a Monday morning, weekly, ends on 25 Dec — the
     sheet's meta line reads "Every week on Monday · until 25 Dec", the Month
     view shows Mondays up to and including the 25th and nothing in January;
   - change the fish series from weekly to every 2 weeks with "All events"
     after cancelling one Monday — the cancelled row now sits on a week the
     rule skips, and nothing shows or errors (the inert-override case, §9);
   - with the seed's three people, put "Kid" alone on an event that overlaps
     both adults' events — no badge, no header warning, no styling; it is just
     an event (§10);
   - add a fourth person in Studio and reload the Day view — four equal lanes,
     no wrap; delete one — three, no empty column;
   - open an occurrence of a two-person series, change its people to one of
     them — the block leaves the other lane on that day only, the meta line
     names one person, and every other day still shows two; "Reset to series
     people" puts it back and the row's `attendees` in Studio is null again;
   - edit that occurrence with "This event only" and change the people chips
     in the editor — the override lands (`saveThisOccurrence` no longer drops
     it).
4. `npm run build && npm run serve:pages`, then load `/lists` cold in a fresh
   tab to confirm it degrades to not-found rather than a blank screen.
5. Do **not** run `supabase db push` as part of this work. `0022` is destructive
   and irreversible against the hosted project, which has no staging twin; it
   should be applied deliberately, with `--dry-run` first.
