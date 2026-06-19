# Next session — connecting Planner to Supabase

The data model is frozen and the migrations are written. This is the runbook to
stand the backend up and start wiring the app to it. Read
[`DATA_MODEL.md`](./DATA_MODEL.md) first for the *why*; this file is the *how*.

## What's already done

**Design + migrations:**
- `docs/DATA_MODEL.md` — frozen design + every decision with its rejected alternative.
- `supabase/migrations/0001_schema.sql` — tables, lookup seeds, indexes, constraints.
- `supabase/migrations/0002_rls.sql` — account-scoped RLS + `is_account_member` / `can_access_series` helpers.
- `supabase/migrations/0003_functions.sql` — `split_series`, `create_account`, new-user mirror trigger.
- `supabase/migrations/0004_grants.sql` — **base-table `GRANT`s to `authenticated`.** `0001`–`0003`
  enabled RLS but never granted table privileges; without this every authenticated query fails
  `42501 permission denied` (RLS filters rows, but Postgres still needs a table-level grant). Any
  fresh DB must apply this.

**Backend stood up + Phase‑2 slice 1 (auth + async seam) DONE & verified** (2026‑06‑19):
- Project linked (`eefdddvbekwywleooioq`), migrations `0001`–`0004` pushed. Email confirmation OFF.
- `src/lib/supabase.ts` — typed client (uses the new-style **publishable key**, not legacy `anon`).
- `src/lib/database.types.ts` — generated from the live schema.
- `src/auth.tsx` — `AuthProvider`: session + idempotent account bootstrap (in-flight dedupe so
  concurrent callers don't create duplicate accounts).
- `src/components/Login.tsx` — email/password sign-in/up; sign-out lives in Settings.
- `src/store/store.ts` — `ScheduleStore` widened to **async** (`Promise`-based).
- `src/state.tsx` — async hydration; `src/App.tsx` `Root` gate (spinner → login → app).

**Data still flows through `LocalStorageStore`.** The remaining work is the `SupabaseStore`
read/write mapping. The seam to swap is `ScheduleStore` in
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
> numeric order** (0001 → 0004).

## 2. App wiring (Phase 2)

1. ~~`npm i @supabase/supabase-js`; env vars in `.env.local`~~ **DONE.** Vars are
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (new-style key, not `anon`).
2. ~~Generate types~~ **DONE** → `src/lib/database.types.ts`.
3. ~~Widen `ScheduleStore` to async~~ **DONE** — it's now `Promise`-based; `state.tsx`
   hydrates asynchronously. **Still TODO:** implement `SupabaseStore implements
   ScheduleStore` and return it from `createStore()` (currently still
   `LocalStorageStore`). Consider adding `subscribe` for realtime at this point.
4. ~~Auth + account bootstrap~~ **DONE** — `src/auth.tsx` gates the app and
   bootstraps the account (`create_account` RPC, idempotent). The active
   `account_id` is held in `AuthProvider`; thread it into `SupabaseStore`.

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
