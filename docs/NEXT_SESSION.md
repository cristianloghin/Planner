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
- `supabase/migrations/0005_person.sql` — people as DATA (`person` + `event_person`); see below.
- `supabase/migrations/0006_realtime.sql` — calendar tables added to the `supabase_realtime` publication.
- `supabase/migrations/0007_user_preferences.sql` — per-user `user_preference` JSON blob (colour overrides).
- `supabase/migrations/0008_realtime_dependencies.sql` — `occurrence_dependency` added to the publication.

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
3. ~~Widen `ScheduleStore` to async~~ / ~~implement `SupabaseStore`~~ **DONE.**
   `ScheduleStore` is now `load()` + `apply(action, next)` + `subscribe(onChange)`.
   `createStore({accountId, userId})` returns `SupabaseStore` (`src/store/supabaseStore.ts`);
   `createStore()` with no ctx still returns `LocalStorageStore`.
4. ~~Auth + account bootstrap~~ **DONE** — `src/auth.tsx`; the active `account_id`
   is threaded into `SupabaseStore` via `createStore` from `state.tsx`.
5. ~~Realtime sync~~ **DONE (slice 3).** `0006_realtime.sql` adds the calendar
   tables to the `supabase_realtime` publication; `SupabaseStore.subscribe` opens
   a `postgres_changes` channel; `state.tsx` does a debounced reload on change,
   **preserving the selected week/day** (UI nav isn't server data) and **deferring
   while an editor is open** (flushes on close) so a partner's edit can't disturb
   an unsaved draft. Verified live: a DB insert appeared in the open app with no
   refresh; the edit-guard deferred then flushed correctly.

### People are now DATA (migration 0005) — overrides DATA_MODEL Decision 1's roster
The app draws one lane per `person` row (account-scoped, `kind` adult|child, optional
`user_id` login link); `event_person` is the roster. `event_participant`/`app_user`
(RSVP) is untouched for a future real-invitee feature. Frontend is generic over N people.

### SupabaseStore mapping gotchas (already handled — read before editing it)
- PostgREST embeds need FK hints `table!fk_col` or you get `PGRST201` (ambiguous —
  e.g. `checklist_item` also links m2m via `occurrence_item_removed`).
- Occurrence rows stay sparse: done→upsert, undone→delete.
- Children sync = upsert + delete-missing (NOT delete-all), else the cascade wipes
  `occurrence_item_state` ticks on every edit.
- Attachment display order is lossy on round-trip (DB has no polymorphic order).

### Still deferred (after slice 3)
- ~~**Standalone Lists** are device-local~~ **DONE (pass 1)** — Lists now sync via the
  backend (`list` + `list_item`, migration `0009`). See §5 for what's wired vs. deferred.
- Recurrence + checklist/note round-trip + removeEvent + person rename/recolor are
  coded but not yet click-tested.
- **Realtime is reload-on-change** (refetch all on any change). Fine at household
  scale; revisit fine-grained delta apply / optimistic-write rollback if needed.
  This is the seam where TanStack Query (cache invalidation) + Zustand would slot
  in when the data layer outgrows the current store.

### Done since slice 3
- **Event templates wired** (DATA_MODEL Decision 10). The `is_template`/`template_id`
  schema was already live (migration `0001`); now the app uses it. `AppState.templates`
  (a series shell: title / all-day / duration / roster / attachments, no timing);
  `SupabaseStore.loadTemplates` reads `is_template = true`, `writeTemplate` writes it
  (shared roster/attachment sync, `dtstart`/`rrule` null). Actions `addTemplate` /
  `updateTemplate` / `removeTemplate`; `addEvent` gained an optional `templateId` that
  stamps `template_id` provenance on the new series. UI: **"Save as template"** in
  `EventEditor` (both modes), a **"Start from a template"** picker in new-event mode
  (deep-copies attachments with fresh ids via `cloneAttachments`), and a **Templates**
  list in Settings (review/delete). The calendar read still filters `is_template = false`,
  so templates never show as events.
- **Site URL** configured to the deployed URL in Supabase → Authentication → URL
  Configuration (was defaulting to `localhost:3000`, which broke auth emails).
- **User preferences** (per-user, per-account `user_preference` JSON blob, migration
  `0007`): first preference is personal event-colour overrides — each user recolours
  any person's lane for their own view; the shared `person.color` stays the default.
  `personColor(state, id)` is the single effective-colour read.
- **`dependsOn` → occurrence dependencies** (the DB's `occurrence_dependency`, not a
  new table). The app is now occurrence-keyed: `AppState.dependencies[occKey]` mirrors
  the table; `blockingPrerequisites` compares each prerequisite occurrence's effective
  status to the edge's `required_status`. Linking lives in `OccurrenceSheet` (pick a
  prerequisite event → a concrete occurrence → required status); the series-level
  "Waits on" chips were removed from `EventEditor`. Occurrence status generalised to
  `done | skipped | blocked` (`setOccurrenceStatus`). Migration `0008` adds
  `occurrence_dependency` to the realtime publication.

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

## 5. Standalone Lists — backend sync wired (DATA_MODEL Decision 11)

**Pass 1 done (2026-06-19):** migration `0009_lists.sql` is live and the
`SupabaseStore` mapping replaces the `localStorage` (`planner.lists.v1`) path.
Implemented + verified against the live DB (create/rename/delete list, add/tick/
remove item all round-trip through a reload):
- `AppState.lists` is now `TodoList[]` (named lists, each with nested `ListItem[]`);
  `ListItem` carries `groupLabel`/`dueOn`/`sortOrder` (persisted) — see `src/types.ts`.
- `SupabaseStore.loadLists` reads `list` + `list_item` ordered by `sort_order`; the
  `apply` cases write `addList`/`renameList`/`removeList`/`add`/`toggle`/`removeListItem`.
- One-time legacy import: `planner.lists.v1` → a default "To-do" list, guarded by a
  localStorage flag **and** an empty-account check so it can't double-import per device.
- Multi-list UI in `src/components/Lists.tsx` (list-tab switcher + create/rename/delete).

**Pass 2 done (2026-06-20):** the deferred columns/links are now wired end to end.
- `group_label` in-list headers (grouping pass, PR #21) — grouped + sorted like a
  checklist on read; an add-form "Group" field with existing-header suggestions.
- **`due_on` deadlines** — an optional per-item deadline. Add-form date input
  (resets per item) + an inline date control on each row; the `setListItemDue` action
  writes `due_on`. Open items past their deadline render red (`isOverdue`, `src/lib/lists.ts`).
- **Occurrence linking** (`list_item_event_link`) — `AppState.listLinks` mirrors the
  table (keyed by occurrence like `dependencies`). A `LinkedTodos` section in
  `OccurrenceSheet` (a "Link a to-do" picker, items grouped by list via `<optgroup>`)
  writes one link row to the concrete occurrence; the linked to-do renders as a
  tickable line whose checkbox dispatches `toggleListItem` — i.e. the **same
  `list_item.done`** as the Lists view, no `occurrence_item_state` row. The reducer
  drops links in memory when an item/list/event is removed (the DB cascades them too).
  A linked to-do never gates the occurrence's completion (§4 math ignores it).

**Schema (all account-scoped, RLS + grants + realtime like `0005`/`0006`):**
- `list` — named list (`title`, `sort_order`).
- `list_item` — `group_label` (in-list **header**, like `checklist_item`), `title`,
  `done` (on the item — single context, **stays checked in place**, can be unchecked),
  `person_id` (`on delete set null` = becomes shared), `sort_order`, **`due_on date`**
  (optional deadline, `null` = none), `created_at`.
- `list_item_event_link` — `(list_item_id, series_id, occurrence_start)`, the **same
  occurrence grain as `occurrence_dependency`** (`occurrence_start` is the original slot,
  **not** an FK; both ends `on delete cascade`).

**Behaviour (implemented — kept as the spec of record):**
- **Sort = checklist parity:** `sort_order` position-derived on write, ordered + grouped
  by `group_label` on read (copy the `checklist_item` path in `supabaseStore.ts`).
- **Linking:** in `OccurrenceSheet` (where dependency-linking already lives), a "Link a
  to-do" picker writes one `list_item_event_link` row to the concrete occurrence. The
  linked to-do renders as a tickable line inside that occurrence; ticking it there **or**
  in the Lists view writes the **same `list_item.done`** — no `occurrence_item_state` row
  for linked items. Realtime reload keeps both views in sync.
- **No completion coupling:** a linked to-do is NOT a `required` checklist item, so it
  never gates the occurrence's "done" (§4 math ignores it).
- **One-time import:** migrate any existing `planner.lists.v1` items into a default list.

## 6. Shares & pins — designed, not built ([Decision 12](./DATA_MODEL.md#12-shares--pins--one-occurrence-grain-table-occurrence_share))

A unified attention mechanism on a **concrete occurrence**: **share** it to another user
(in-app inbox + toast) or **pin** it for yourself (private quick-jump, no notification).
Both are rows in one `occurrence_share` table — a pin is just a self-share. See
[DATA_MODEL Decision 12](./DATA_MODEL.md#12-shares--pins--one-occurrence-grain-table-occurrence_share)
for the schema and the *why* (single RLS policy, `kind` flag, occurrence identity).

Build in two layers:

**Layer 1 — in-app (small, ~1 day, no new infra):**
1. Migration `0012_shares.sql` — `occurrence_share` + RLS
   (`to_user = auth.uid() or from_user = auth.uid()`) + grants + add to the realtime
   publication **with `REPLICA IDENTITY FULL`** so dismiss/un-pin (DELETE) syncs (the
   bug fixed in `0011`).
2. `SupabaseStore`: a `loadShares()` (RLS returns just the user's visible rows); `apply`
   cases `shareOccurrence` / `pinOccurrence` (insert) and `dismissShare` / `unpin`
   (delete, or set `read_at` for read state). `occurrence_start` via the existing
   `occurrenceTs(ev, date)` helper, exactly like dependencies / to-do links.
3. `state.tsx`: add `shares` to `AppState`; reducer cases; the app splits the loaded
   array into `favorites` (pins), `inbox` (shares to me) and `sent` (shares from me).
   Realtime already calls `reloadFromStore`, so a partner's share lands within ~300ms
   while their app is open.
4. UI: a star + "Share with…" picker in `OccurrenceSheet` (where dependency- and to-do
   linking already live); a favorites list and an inbox badge; clicking either jumps to
   the occurrence's day. The toast fires only for
   `kind='share', to_user = me, from_user <> me` — pins are silent.
5. `split_series`: decide whether to migrate future `occurrence_share` rows onto the new
   series id (mirror the other occurrence-grain tables in the `0010` RPC) or leave them.

**Layer 2 — real background push (separate, larger; the app's first backend component):**
A notification when the recipient's app is **closed** needs infra that doesn't exist
yet: a Supabase **Edge Function** + a DB trigger/webhook on `occurrence_share` insert, a
`push_subscription` table (per device), VAPID keys, and a service-worker `push` handler
(the PWA service worker exists via `vite-plugin-pwa` but has no push handler). iOS only
supports web push for *installed* PWAs (16.4+). Design it once to also cover **reminders**
— which today only fire while the app is open (`AlertHost.tsx`) — not just shares.

## 7. Still unmapped (decide when you reach them)

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
