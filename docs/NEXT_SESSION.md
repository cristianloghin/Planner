# Next session — connecting Planner to Supabase

The data model is frozen and the migrations are written. This is the runbook to
stand the backend up and start wiring the app to it. Read
[`DATA_MODEL.md`](./DATA_MODEL.md) first for the *why*; this file is the *how*.

## What's already done (in this branch)

- `docs/DATA_MODEL.md` — frozen design + every decision with its rejected alternative.
- `supabase/migrations/0001_schema.sql` — tables, lookup seeds, indexes, constraints.
- `supabase/migrations/0002_rls.sql` — account-scoped RLS + `is_account_member` / `can_access_series` helpers.
- `supabase/migrations/0003_functions.sql` — `split_series`, `create_account`, new-user mirror trigger.

Nothing in the running app has been changed yet — the Phase‑1 localStorage store
is untouched. The seam to swap is `ScheduleStore` in
[`src/store/store.ts`](../src/store/store.ts).

## 1. Link the Supabase project and apply migrations

```bash
# one-time
npm i -g supabase           # or: brew install supabase/tap/supabase
supabase init               # creates supabase/config.toml (keep our migrations/ dir)
supabase link --project-ref <YOUR_PROJECT_REF>   # from the dashboard URL

# push the schema
supabase db push            # applies migrations/0001 -> 0003 in order
```

Verify in the dashboard: 20 tables, RLS enabled on all, `split_series` /
`create_account` under Database → Functions, and the `on_auth_user_created`
trigger on `auth.users`.

> If you'd rather not use the CLI, paste each migration into the SQL editor **in
> numeric order** (0001, 0002, 0003).

## 2. App wiring (Phase 2)

1. `npm i @supabase/supabase-js`. Add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to `.env.local` (already gitignored — confirm).
2. Generate types: `supabase gen types typescript --linked > src/lib/database.types.ts`.
3. Implement `SupabaseStore implements ScheduleStore` and return it from
   `createStore()`. Note the interface is currently **synchronous**
   (`load(): AppState`) — Phase 2 needs async/subscription, so expect to widen
   `ScheduleStore` to `Promise`-based (or add `subscribe`) rather than fit
   Supabase into the sync shape.
4. Auth: a signed-in user with no account calls the `create_account` RPC once;
   store the active `account_id` client-side.

## 3. Calendar library — the load-bearing contract

The DB does **no** RRULE math. Add [`rrule`](https://github.com/jkbrzt/rrule)
(`npm i rrule`) and make it the single source of recurrence truth:

- **Forbid `COUNT` on write.** Convert any `COUNT` rule to its `UNTIL`
  equivalent before storing. (`split_series` and verbatim rule-copy both depend
  on this — see DATA_MODEL.md Decision 2.)
- **"Edit this and following":** compute `p_cutover` = the first
  `occurrence_start` ≥ the edit point (a **real slot**, never `now()`) and
  `p_truncated_rrule` = the old rule trimmed with `UNTIL` just before it, then
  call `split_series(series, cutover, truncated)`. Apply the user's edit to the
  returned new series id. Passing a non-slot `p_cutover` silently reschedules the
  event and re-orphans rows — the one mistake to guard against in app code.

## 4. Completion rule (compute in the app)

- No checklist → read `event_occurrence.status`.
- With a checklist → occurrence is **done** when every `required` `checklist_item`
  (minus tombstoned, plus one-off adds) has a `done` row in
  `occurrence_item_state`. `event_occurrence.status = null` means "compute"; a set
  value overrides.

## 5. Still unmapped (decide when you reach them)

- **Standalone Lists** (`ListItem`) have no table yet — likely `list` +
  `list_item` scoped to `account_id`. Its `done` lives on the item (single
  context), unlike checklist ticks.
- **RLS granularity:** the baseline lets any account member read/write the
  account's series. Add an `account_member.role` check if you need owner-only
  writes.

## Smoke test after wiring

1. Sign up → confirm an `app_user` row appears.
2. `create_account('Home')` → you're an `owner` member; the account is visible.
3. Create a weekly `event_series`; tick an item on one occurrence → one
   `occurrence_item_state` row, other weeks unaffected.
4. `split_series` at a real future slot → new series id returned, future ticks/
   participants/notes moved onto it, old series' `rrule` now `UNTIL`-bounded.
5. As a non-member, confirm RLS hides all of the above.
