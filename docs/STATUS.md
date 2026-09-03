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
- **Routes** — the five tabs are real URLs (`/day`, `/week`, `/month`, `/lists`,
  `/settings`) over `@mikrostack/router`, with `/` guarded to redirect to
  `/day`. The screens themselves are unchanged: the editors and the occurrence
  sheet are still their own local state, and the auth gate is still imperative
  rather than a route guard, because a guard needs a non-React
  `isAuthenticated()` and that means adopting `services/session`.

## The data layer, as it stands

Mid-migration, and worth knowing before adding a slice:

- Events and dependencies still flow through the **reducer + `ScheduleStore`**
  (`src/state.tsx`, `src/store/`) with a hand-rolled write queue and a
  localStorage snapshot. That is all the reducer holds now.
- **`occurrences` is adopted** — the first slice to run through `client/` and
  `domains/` for real. Reads and writes both go through the domain, and
  `data/completions.ts` is gone. Six screens call `useCompletionsForRange` from
  `domains/occurrences/queries`, passing `accountId`; the sheet and the editor
  write through one `useOccurrencesWrite`.
- **Templates** now read and write through `domains/events` (`useTemplates`
  and the `saveTemplate` / `removeTemplate` changes of `useEventsWrite`).
  `data/templates.ts` and `data/useAccountStore.ts` are gone.
- **People and preferences are adopted.** Every screen reads them through
  `usePeople` / `usePreferences` with the domain selectors; Settings writes
  through `usePeopleWrite` / `usePreferencesWrite`. The timezone stamp is an
  effect in the app shell over the preferences query, guarded to fire once per
  zone per session. Both slices, their six actions, the reducer cases, the
  store's loads and writes, and `lib/people.ts` are deleted. A queue saved by
  an older build may still hold one of those actions; `state.tsx` drops it on
  read with a warning. Two things worth knowing: `user_preference` is **not in
  the realtime publication**, so another device's change only arrives on a
  refetch; and the stamp now compares against the cached document, so a
  restart inside the five-minute stale window compares against the last cached
  zone rather than a fresh read (the next focus refetch corrects it).
- **Lists are adopted.** The Lists screen and the sheet's linked to-dos read
  through `useLists` / `useListLinks` and write through `useListsWrite`; the
  reducer edit guard is gone from Lists because every write patches the cache
  first. The ten list actions, their reducer cases, the store's two loads, ten
  write cases and the pre-0009 legacy import, `lib/lists.ts` and the two
  slices on `AppState` are deleted; `state.tsx` drops a queued list action
  from an older build on read.
- **Realtime** runs through `services/realtime` over `client/realtime.ts`.
  `state.tsx` hands the service the client's channel and gets one folded
  report per burst; `queryKeysForTable` in `domains/index.ts` turns each table
  into the Query keys to invalidate, and the reducer reloads only when one of
  its own tables changed. A reconnection invalidates the whole Query cache and
  reloads. `SupabaseStore.subscribe` and the store interface's `subscribe`
  are deleted; the store now only loads and applies.
- The rest of **`client/` and `domains/`** is built and **not yet adopted**.
  Every call the app makes to Supabase has a client function — 15 tables, 4
  RPCs, the 6 auth methods, the realtime channel — and eight domains sit over
  them. Everything outside occurrences, templates, people, preferences and
  lists still runs through `SupabaseStore`, `state.tsx`, `auth.tsx`,
  `lib/search.ts` and `lib/push.ts`.
- **`services/` is different, and better off.** Those were real moves, not
  parallel copies: `lib/recurrence`, `lib/occurrences`, `lib/timing`,
  `lib/timelineLayout`, `lib/conflicts`, `lib/notifications`,
  `lib/useSwipeGestures` and `lib/push` now forward to a service, so there is one
  implementation and nothing to drift. The app is unchanged; the forwarders
  delete once routes import the services directly.

Each slice has exactly one owner. `RESTRUCTURE_PLAN.md` is where this ends up.

**So the unadopted parts duplicate code that is still live.** `client/search.ts`
mirrors `lib/search.ts`, `client/push.ts` mirrors the row writes in
`lib/push.ts`, and `client/series.ts`, `client/lists.ts`, `client/people.ts` and
`client/preferences.ts` mirror `supabaseStore.ts`. Above them, the domains'
`patches.ts` files mirror `store/reducer.ts`.

**A fix to one side has to be made on the other.** Adopt a slice and delete its
old path rather than letting the pair age.

`SupabaseStore`'s five per-occurrence write methods are the current example of
what "delete the old path" leaves behind: they have no callers now, and stay
only until the reducer path around them goes.

### Adopting a slice

`occurrences` went first and is done, so `client/` and `domains/` are no longer
untried against a real database. What that took, for the next one:

- **The cache key does not change.** Same key, same windows, so it is a swap
  rather than a migration — and `src/types.ts` already re-exports the domain
  types, so screens are typed against the new shapes before they call them.
- **`accountId` becomes an argument.** Domains take it rather than reading it
  ambiently (R8). Until a slice's screens are routes, they read it from
  `useAuth` themselves; the route supplies it later.
- **The mutation key changes, and queued writes do not survive that.** A write
  paused offline is stored under its key; if nothing is registered for that key
  when it resumes, query-core rejects it, `resumePausedMutations` swallows the
  rejection, and it is gone without a word. Bump `CACHE_BUSTER` in
  `lib/queryClient.ts` in the same change — the write is lost either way, but
  visibly and once.
- **Verify against the local stack, not the type checker.** The useful check is
  that a cold cache fetches and a warm one does not, which is what proves the
  domain reads the key the old path wrote.

Registration itself is settled: `registerDomainDefaults(queryClient)` in
`domains/index.ts` is called once in `main.tsx` before `createRoot`, and a new
domain with writes gets a line there. It asks nothing of the session, because
the account rides in each write's values rather than being handed to the
register function — see [Decision: the account is a value, not a
closure](#the-account-is-a-value-not-a-closure) below.

Still to adopt, cheapest first:

- **`search`** — two functions, no writes, no cache shaping; `lib/search.ts`
  deletes when it works.
- **The reducer slice** — events with dependencies, the last one. People,
  preferences and lists set the pattern: readers one screen at a time, then
  the writers, then delete the old path in one commit. Events carries the edit
  guard and the split flow, so it is the biggest.

### The account is a value, not a closure

Registration takes only the query client. It used to take `accountId`, which
meant it could not run until the session had resolved — but `main.tsx` resumes
paused writes as soon as the saved cache is read out of localStorage, which is
well before that. Every domain write in the queue was dropped before its
behaviour existed.

The account was never needed that early. Reads need it, and an insert that sets
`account_id` needs it, but RLS scopes an update by row id: `renamePerson` does
not need to know the account. So it rides in the write's values (R9), which is
also what makes a resumed write self-sufficient.

## Tests

`npm test` — 238 tests, no backend needed. Recurrence expansion and the RRULE
round-trip (`src/lib/`), occurrence completion and dependency gating, Lists
helpers, date math, the reducer's optimistic application, the offline queue, the
client-layer conversions (`src/client/mappers.test.ts`), and a cross-validation
of the edge function's recurrence logic against the client's.

169 of them now live under `client/`, `domains/` and `services/`, but only 116 are
*new* — the recurrence and occurrence-status tests moved there with their code.
The new ones cover: the client's conversions
(`mappers.test.ts`, including `occurrenceTs` across both clock changes) and each
domain's transformers, selectors and optimistic patches. The most valuable are the
checklist round-trip in `domains/events` — grouping flat rows into checklists and
back, which could not be tested at all while it lived inside a database call — and
`domains/occurrences`, which pins the rule that a day carrying nothing the app
shows gets no entry, on both the read and the optimistic update.

The two service stores add 17 more, and are worth knowing about because they
needed no network at all: both `session` and `realtime` are handed their source
as an argument, so a stub drives them. That is the practical dividend of "a
service is fed, not self-serving" — the rule pays for itself in tests before it
pays for itself in structure.

`domains/occurrences` gained three more with the occurrences adoption, pinning
what happens when two rows land on the same day — see the gotcha below. Only one
of the three fails without the fix; the other two guard the neighbouring cases.

The remaining gap is every DB round-trip, which needs a click-test rather than a
unit test. `client/`'s occurrence functions have now had one — reads and writes
both, against the local stack — but the rest of `client/` and all of
`SupabaseStore` have not.

---

## Gotchas — read before editing `supabaseStore.ts` or `client/`

These are the rules both copies encode. Breaking one is silent.

- PostgREST embeds need FK hints `table!fk_col` or you get `PGRST201` (ambiguous
  — e.g. `checklist_item` also links many-to-many via `occurrence_item_removed`).
- Occurrence rows stay sparse: done → upsert, undone → delete.
- Two occurrence rows can land on the same **day**, because a row is stored at
  the time of day the series had when it was written and a later time edit does
  not move it. `toCompletions` layers them rather than letting the last win, or
  a day marked done by one row and moved by another comes back missing the tick.
  Writes avoid making a second row (see `dayRange`), but a pair written before
  that rule existed reads back as two forever.
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

## Running it locally

The whole backend runs in Docker, from the same images as the hosted project:

```bash
supabase start
```

That applies `0001`–`0021` to a fresh database and then `supabase/seed.sql`,
which creates one account with two adults, a child, a few events (one weekly with
two checklists), two lists and a blueprint — enough that every screen has
something on it.

Sign in as **dev@planner.test / password123**. Auth email goes to Inbucket on
`:54324`, not to a real inbox — that is where the confirmation link lands if you
sign up through the app instead. Studio is on `:54323`.

Point `.env.local` at what `supabase start` prints (`VITE_SUPABASE_URL` and the
publishable key). **Clear site data when you switch backends**: the query cache
lives in localStorage under `planner.queryCache.v1` (the `v2` buster discards
its contents, not the key) and the offline snapshot is
keyed by account id, so the same origin pointed at a different database will
render the previous account's data before the first fetch lands.

The reminder sender is a separate process:

```bash
supabase functions serve send-reminders
```

Two things localhost cannot reproduce: the `pg_cron` beat from `0019` that
triggers that function on a schedule, and iOS push, which needs the app added to
the Home Screen. Invoke the function by hand instead.

### Testing what the deployment actually does

`npm run dev` is not a rehearsal. The base path (`/Planner/`), the service worker
built from `src/sw.ts`, and the generated icons only exist in a real build:

```bash
npm run build && npm run serve:pages
```

`serve:pages` serves `dist/` the way GitHub Pages does — and specifically **does
not** rewrite unknown paths to `index.html`. `vite preview` does, which hides the
one failure worth catching: Pages serves `404.html` for any path it has no file
for. `npm run build` copies the built `index.html` to `404.html` so a cold visit
to a deep link still boots the app. Open one in a fresh tab; the response is a
404 and the app renders anyway, which is exactly what a real visitor gets.

Routes have landed, so this is live rather than theoretical. All three paths
were checked once against the built app: the dev server under the base, a cold
visit through `404.html` (a 404 response with the app rendering), and the
service worker's own navigation fallback serving from cache. None of them had
ever run before, because until routes there were no deep links.

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
