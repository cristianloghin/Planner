# Status

Where the app actually is, and the gotchas worth knowing before editing.

For the *why* behind the schema see [`DATA_MODEL.md`](./DATA_MODEL.md); for where
the code is going see [`RESTRUCTURE_PLAN.md`](./RESTRUCTURE_PLAN.md); for what is
designed but unbuilt see [`PLANNED.md`](./PLANNED.md).

---

## Built and live

Phase 2 is done: the app runs on Supabase with accounts, auth and cross-device
sync. Migrations `0001`–`0021` are applied.

- **Auth + account bootstrap** — email/password sign-in, `create_account`, the
  new-user mirror trigger. Sign-out lives in Settings.
- **People as data** (`0005`) — one calendar lane per `person` row
  (`adult`/`child`, optional login link). The frontend is generic over N people.
- **Events, occurrences, checklists, notes, reminders** — the full series /
  occurrence model, with `split_series` for "this and following".
- **Realtime sync** (`0006`, `0008`, `0011`, `0016`) — a partner's change appears
  live, deferred while you are mid-edit. `REPLICA IDENTITY FULL` on the RLS-gated
  tables so DELETEs propagate.
- **Occurrence dependencies** — link an occurrence to a concrete occurrence of
  another event via `occurrence_dependency`.
- **Standalone Lists** (`0009`) — named account-scoped lists with in-list
  headers, per-item deadlines, and to-dos linkable to a calendar occurrence;
  ticking in either place is the same write.
- **Event templates** — reusable series shells (`is_template = true`), saved from
  the editor and deep-copied into new events.
- **Unified colour palette** (`0015`) — one 12-colour set keyed `'1'`–`'12'` for
  both people and events, with values in CSS (`src/styles/swatches.css`) and
  per-user overrides in `user_preference`.
- **Full-text search** (`0014`, recreated in `0017`) — `search_events` /
  `search_list_items`, `SECURITY INVOKER` so RLS scopes results.
- **Web Push reminders** (`0018`–`0021`) — reminders delivered while the app is
  closed, via the `send-reminders` edge function on a pg_cron beat. Setup,
  verification and field-tested failure modes are in
  [`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).

## The data layer, as it stands

Mid-migration, and worth knowing before adding a slice:

- Most slices flow through the **reducer + `ScheduleStore`** (`src/state.tsx`,
  `src/store/`) with a hand-rolled write queue and a localStorage snapshot.
- **Templates** and **per-occurrence state** are owned by **TanStack Query**
  (`src/data/`), fetched per window in the occurrence case.
- The **`client/` and `domains/` layers** are both **complete but not yet
  adopted.** Every call the app makes to Supabase has a client function — 15
  tables, 4 RPCs, the 6 auth methods, the realtime channel — and eight domains
  sit over them with queries, mutations, transformers, selectors and pure
  optimistic patches. Only the occurrence window read is wired up at all
  (`data/completions.ts` calls the client directly, not the domain). Everything
  else still runs through `SupabaseStore`, `state.tsx`, `auth.tsx`,
  `lib/search.ts` and `lib/push.ts`.

Each slice has exactly one owner. `RESTRUCTURE_PLAN.md` is where this ends up.

**So both layers duplicate code that is still live.** `client/search.ts` mirrors
`lib/search.ts`, `client/push.ts` mirrors the row writes in `lib/push.ts`, and
`client/series.ts`, `client/lists.ts`, `client/people.ts`, `client/preferences.ts`
and the `client/occurrences.ts` writes mirror `supabaseStore.ts`. Above them, the
domains' `patches.ts` files mirror `store/reducer.ts`, and
`domains/occurrences/queries.ts` mirrors `data/completions.ts`.

One duplicate is worth singling out: `client/occurrences.ts` still exports a
deprecated `fetchOccurrenceWindow`, because `data/completions.ts` calls it at
runtime. The merge it does now also exists, tested, in
`domains/occurrences/transformers.ts`. That pair is the clearest drift risk in the
codebase.

**A fix to one side has to be made on the other.** Adopt a slice and delete its
old path rather than letting the pair age.

### Adopting a slice

Nothing in `client/` or `domains/` has ever talked to the database — only their
pure parts are tested, so the first slice adopted is also the first real test of
both layers. Two candidates:

- **`search`** is the cheapest. Two functions, no writes, no cache shaping;
  `lib/search.ts` deletes when it works.
- **`occurrences`** is the most valuable. It is already on Query, so adopting it
  is mostly swapping what `data/completions.ts` calls — and it deletes the
  duplicated merge above.

Whichever comes first, the app must call every domain's
`register<Name>Defaults(queryClient, accountId)` once at start-up, before paused
writes resume. A domain whose register function is never called silently never
replays its offline writes.

## Tests

`npm test` — 218 tests, no backend needed. Recurrence expansion and the RRULE
round-trip (`src/lib/`), occurrence completion and dependency gating, Lists
helpers, date math, the reducer's optimistic application, the offline queue, the
client-layer conversions (`src/client/mappers.test.ts`), and a cross-validation
of the edge function's recurrence logic against the client's.

Of those, 99 cover the new layers: the client's conversions
(`mappers.test.ts`, including `occurrenceTs` across both clock changes) and each
domain's transformers, selectors and optimistic patches. The most valuable are the
checklist round-trip in `domains/events` — grouping flat rows into checklists and
back, which could not be tested at all while it lived inside a database call — and
`domains/occurrences`, which pins the rule that a day carrying nothing the app
shows gets no entry, on both the read and the optimistic update.

The remaining gap is every DB round-trip — `SupabaseStore`'s, and now `client/`'s
too. Both need a live click-test rather than a unit test, and `client/`'s has not
had one: it is unexercised code until a slice adopts it.

---

## Gotchas — read before editing `supabaseStore.ts` or `client/`

These are the rules both copies encode. Breaking one is silent.

- PostgREST embeds need FK hints `table!fk_col` or you get `PGRST201` (ambiguous
  — e.g. `checklist_item` also links many-to-many via `occurrence_item_removed`).
- Occurrence rows stay sparse: done → upsert, undone → delete.
- Children sync is upsert + delete-missing, **not** delete-all — otherwise the
  cascade wipes `occurrence_item_state` ticks on every edit.
- Attachment display order is lossy on round-trip (the DB has no polymorphic
  order). Content round-trips; interleaving does not.
- Occurrence rows are matched by a **day range**, never an exact timestamp: the
  stored `occurrence_start` carries the time-of-day the series had when the row
  was written, so an exact match silently misses every row written before a
  series time edit. See `dayRange` in `src/client/mappers.ts`. Writing a *new*
  row is the other half — `occurrenceTs` in the same file — and the two must not
  be swapped: match by range, insert by timestamp.
- Notes keep their original `author_id`, and reminder deletes are scoped to
  `user_id`. Both stop one partner's edit from taking over or removing the
  other's rows.
- Events and templates are one table (`event_series`). `client/series.ts` treats
  them as one; `supabaseStore.ts` still has two write paths for them.

Two rules that are easy to break and live in `DATA_MODEL.md`:

- **Never store a `COUNT` rrule** — convert to `UNTIL` at the app boundary
  ([Decision 2](./DATA_MODEL.md#2-recurrence--rfc5545-rrule-strings-never-count)).
- **`split_series`' cutover must be a real `occurrence_start`**, computed by the
  calendar library — never `now()`. Passing an arbitrary instant silently
  reschedules the event and re-orphans its rows
  ([Decision 3](./DATA_MODEL.md#3-edit-this-and-following--series-split-not-temporal-versioning)).

---

## Standing up a fresh backend

```bash
npm i -g supabase                 # or: brew install supabase/tap/supabase
supabase link --project-ref <ref> # from the dashboard URL
supabase db push                  # applies 0001 -> 0021 in order
```

Then: Authentication → URL Configuration → **Site URL** = the deployed URL (it
defaults to `localhost:3000`, which breaks auth emails), and the Web Push setup
in [`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).

Applying migrations by hand instead? Paste them **in numeric order** — `0004`
in particular is not optional: `0001`–`0003` enable RLS but never grant table
privileges, and without it every authenticated query fails `42501 permission
denied`.

**Smoke test:** sign up → an `app_user` row appears. `create_account('Home')` →
you are an `owner` member. Create a weekly series, tick an item on one
occurrence → exactly one `occurrence_item_state` row, other weeks unaffected.
`split_series` at a real future slot → new series id, future ticks/participants/
notes moved onto it, the old series' `rrule` now `UNTIL`-bounded. As a
non-member, confirm RLS hides all of it.
