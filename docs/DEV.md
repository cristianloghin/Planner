# DEV — the technical picture

Everything you need to change this codebase safely, in one place. Written to be
read cold. If something here disagrees with the code, the code is right and this
is a bug — fix it.

- The layer pattern lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md), with open
  questions in [`PATTERN_NOTES.md`](./PATTERN_NOTES.md).
- How to run and deploy lives in the [README](../README.md).
- Superseded docs are in [`archive/`](./archive/README.md) and are **not** current.

---

## 1. What the app is

A PWA for a household to plan a shared week. Sign-in is required. Everything is
scoped to an **account**, which is the sharing boundary — people, events and
preferences all belong to one, and RLS enforces it.

An **event is a pattern, not a diary entry.** `event_series` holds the rule; the
days it produces are computed, never stored. The only rows about a specific day
are sparse *overrides* in `event_occurrence`, written when a day differs from its
series.

Five screens, four of them routes: Day, Week, Month, Settings (`/` redirects to
`/day`).

---

## 2. The schema

Ten tables. No enum-as-table lookups; the only check constraint in `public` is
`template_or_scheduled`, which is a structural invariant.

| Table | Holds |
|---|---|
| `account` | the sharing boundary |
| `account_member` | who is in it |
| `app_user` | mirrors `auth.users`; id only |
| `person` | a calendar lane: `name`, `color_key`, `sort_order`. **No kind of person.** |
| `event_series` | the pattern — and templates, told apart by `is_template` |
| `event_occurrence` | sparse per-day overrides |
| `reminder` | per user, per series, an offset in seconds |
| `notification_log` | what the sender already sent (dedup) |
| `push_subscription` | one row per browser |
| `user_preference` | a `prefs` jsonb bag per user per account |

```
event_series   id, account_id, title, all_day, dtstart, duration, rrule,
               attendees uuid[], is_template, color_key, metadata, created_by, …

event_occurrence  series_id, occurrence_start,          -- identity: the ORIGINAL slot
                  rescheduled_to, rescheduled_duration, -- moved
                  cancelled,                            -- removed
                  attendees uuid[],                     -- null = as the series
                  metadata
```

Functions: `create_account`, `handle_new_user`, `is_account_member`,
`can_access_series`, `search_events`, `schedule_reminder_sender`,
`unschedule_reminder_sender`.

Realtime publishes `event_series`, `event_occurrence`, `person`, `reminder`.

---

## 3. Decisions worth knowing

**Tenancy is `account`.** Every table reaches it directly or through
`can_access_series`. RLS is membership-based and uniform; there is no per-row
sharing yet (see §8).

**Occurrence identity is the original slot.** A per-day row is keyed by the day
the *rule* produces, not by where the occurrence ended up. Moving an occurrence
sets `rescheduled_to`; the row stays filed under its origin. This is what lets a
moved day keep its identity, and it is why the next rule exists.

**Occurrence rows are matched by day range, never by exact timestamp.** The
stored `occurrence_start` carries the time-of-day the series had *when the row
was written*, so a later time edit leaves it behind. An exact match silently
misses every row written before that edit. Match with `dayRange`, insert with
`occurrenceTs` — both in `src/client/mappers.ts`, and do not swap them.

Two rows can therefore land on the same day. `toCompletions` layers them rather
than letting the last win.

**A series is edited in place. There is no split.** "All events" rewrites the
row, cadence and end included. A per-day row for a day the rule no longer
produces is *inert* — never matched, never rendered — but it is not deleted, so
if the rule later produces that day again the old row applies. Cancel Tuesday,
switch weekly→daily, and that Tuesday is still cancelled. This is the accepted
price of editing in place: an occurrence *is* "the one on this day".

**The database does no recurrence math.** The rrule string is the whole story,
including how the series ends: `UNTIL` for a date, `COUNT` for a number of
times, neither for infinite. Both are RFC-5545 and the `rrule` package
round-trips them. (An older rule "never store a `COUNT`" existed because copying
a rule on a split would restart the count — that reason died with the split.)

**Recurrence is hand-rolled, deliberately.** `src/services/recurrence/expand.ts`
computes `startsOn` arithmetically rather than asking `rrule` to expand. This was
tried the other way and reverted: `rrule` has no O(1) membership test — every
query walks from `dtstart` — and `startsOn` is called per event per rendered day.
Measured on a 42-cell month grid with 40 events, the library costs ~6300 ms per
20 renders against ~2 ms. Using it needs a window-shaped API and a cache; the
arithmetic is a cheaper interface to the same maths. See the revert message on
`445d8a9` before trying again.

**The sender is a second implementation of that maths**, in UTC, in
`supabase/functions/send-reminders/logic.ts`. `reminderSenderLogic.test.ts`
cross-validates the two across ~120 days and every rule shape. **If you change
one, change both** — that test is the only thing standing between a partner and
a push about an occurrence the calendar does not show.

**Attendees are `uuid[]` columns, not a junction table.** The series holds the
roster; an occurrence's column overrides it, `null` meaning "as the series".
Same shape both sides, so reading through is `occurrence.attendees ??
series.attendees`. No SQL joins them; the app filters in memory.

> ⚠️ **There is no foreign key.** `event_person` had `ON DELETE CASCADE`, so
> removing a person removed them from every event for free. An array does not.
> This is only safe because **there is no delete-person path** — `client/people.ts`
> has fetch, rename and recolour, and Settings has no delete UI. If you add one,
> you own cleaning both columns. The read side degrades to a visible `?` rather
> than throwing.

**`metadata jsonb` on `event_series` and `event_occurrence`** is a pressure
valve for structured extras. Nothing reads or writes it. That is safe by
construction: `saveSeries` upserts a named column list and `writeOccurrenceRow`
does a partial update, so app writes leave the bag alone (verified by hand).

**Templates are `event_series` rows with `is_template = true`** and no date. One
table, one module — `client/series.ts` treats events and templates as the same
thing.

---

## 4. How data moves

Four layers, described properly in [`ARCHITECTURE.md`](./ARCHITECTURE.md):

```
client/    every Supabase call. No React.
domains/   queries, mutations, transformers, patches, selectors — per domain.
services/  engines and stores: recurrence, notifications, realtime, session, …
assets/    generic UI, hooks, date/colour utilities.
components/ screens.
```

**A read** is a TanStack Query hook in `domains/*/queries.ts` calling a
`client/` function, shaped by a transformer.

**A write** goes through a domain's mutation as a *change object* — `{ kind:
'cancel', series, date }` — never a raw call. Each write registers defaults at
start-up (`registerDomainDefaults`), which is what lets a write paused offline be
replayed after a restart. **A domain that does not register has its offline
writes dropped silently.**

**Optimistic updates** are pure functions in `patches.ts`, applied in `onMutate`
and rolled back in `onError`. Per-day state is windowed by month with overlapping
margins, so one day can sit in several cached months — patches apply to all of
them.

**Realtime** invalidation is one table → query keys, in `domains/index.ts`
(`queryKeysForTable`). A table nothing caches returns `[]`.

> ⚠️ **Bump `CACHE_BUSTER` in `src/queryClient.ts` whenever mutation keys
> change.** The query cache is persisted to localStorage; a write paused offline
> under a key that no longer exists is otherwise dropped without a word.

---

## 5. Gotchas

- **PostgREST embeds need FK hints** (`table!fk_col`) when more than one path
  exists, or you get `PGRST201`. Only `reminder` is embedded now, so the hint is
  merely explicit — keep it.
- **Reminder deletes are scoped to `user_id`.** Reminders are personal; one
  partner's edit must not remove the other's.
- **Sparse rows must stay sparse.** A row carrying nothing the app shows is left
  out of `toCompletions` entirely, so an empty row reads as "nothing happened
  here". Note that nothing garbage-collects empty rows any more — the code that
  did went with occurrence status, and `clearOccurrenceOverride` already left
  them behind, so the app never relied on it.
- **`effectiveOccurrence`'s early return must test every override field.** It
  short-circuits when a day carries nothing. A day overriding only its *people*
  has no timing, so a guard that checks timing alone hands back the series and
  the override is written and then silently ignored. There is a test for exactly
  this; it is mutation-checked.
- **Switching backends leaves stale data on screen.** The query cache lives in
  localStorage and the offline snapshot is keyed by account id, so the same
  origin pointed at a different database renders the previous account's data
  until the first fetch lands. It looks like data loss and is not. Clear site
  data when you switch.

---

## 6. Tests

`npm test` — 170 tests, no backend needed. It covers the pure logic that is
easiest to get quietly wrong:

- recurrence expansion (`services/recurrence/`)
- the RRULE round-trip (`client/rrule.ts`)
- date maths (`assets/utils/dates.ts`)
- DB↔app conversions (`client/mappers.ts`)
- each domain's transformers, selectors and optimistic patches
- the session and realtime stores
- **the sender-vs-client cross-validation** — the one to watch

**What it does not cover: any round trip to the database.** That needs a
click-test against the local stack. When you touch `client/`, assume nothing is
verified until you have run it.

Useful habit: when a test is meant to catch a specific bug, **break the code and
confirm the test fails.** Several tests in this repo were verified that way, and
one mutation turned out to be equivalent (an `UNTIL` at midnight vs end-of-day —
occurrences sit at UTC midnight, so both include the cap day). Watch for `sed`
that silently fails to apply; a mutation test that never mutated proves nothing.

---

## 7. Push notifications

Reminders fire two ways: in-app while the tab is open (`services/notifications`),
and Web Push while it is closed (`supabase/functions/send-reminders`, driven by
`pg_cron`).

**Setup, once per project:**

1. `npx web-push generate-vapid-keys` — the public key is client-safe, the
   private key belongs only in function secrets.
2. `VITE_VAPID_PUBLIC_KEY` into `.env.local` and into GitHub → Settings →
   Secrets and variables → Actions → **Variables**. Without it the Notifications
   section does not render.
3. Function secrets:
   ```bash
   supabase secrets set --project-ref <ref> \
     VAPID_PUBLIC_KEY='…' VAPID_PRIVATE_KEY='…' \
     VAPID_SUBJECT='mailto:you@example.com' \
     CRON_SECRET="$(openssl rand -base64 32)"
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
4. Schedule it once, from the SQL editor, passing the same `CRON_SECRET`:
   ```sql
   select schedule_reminder_sender(
     'https://<ref>.supabase.co/functions/v1/send-reminders', '<CRON_SECRET>');
   ```

The function authenticates with its own `x-cron-secret` header, not Supabase API
keys — comparing bearers against the runtime-injected service key proved brittle
across the legacy-JWT and `sb_secret_…` systems and 403'd spuriously. Its
platform "Verify JWT" is disabled in `supabase/config.toml`.

**Two things localhost cannot reproduce:** the `pg_cron` beat, and iOS push
(which needs the app on the Home Screen). Run the sender by hand instead:

```bash
supabase functions serve send-reminders
```

That also boots the module graph, which is how you catch an import that Vite
resolves but Deno does not.

---

## 8. Designed, not built

- **The note model** — [`NOTE_MODEL.md`](./NOTE_MODEL.md). A richer note /
  document model. The old free-text note *attachments* were removed; that
  cleared the ground for this rather than contradicting it. **Next up.**
- **Shares & pins** — one `occurrence_share` table at occurrence grain: share a
  concrete occurrence to another user (inbox + toast), or pin it for yourself (a
  pin is a self-share). Design in
  [`archive/DATA_MODEL.md`](./archive/DATA_MODEL.md) Decision 12; the wiring
  notes in `archive/PLANNED.md` describe a data layer that no longer exists.
- **Finer RLS.** Today membership grants everything in an account. Per-row
  visibility would need policies that consult a share/visibility table.

## 9. Restructure: what is left

The DRSp move is largely done — `client/`, `domains/`, `services/`, `assets/`
and real routes all landed. Outstanding:

- **`layouts/`** — a layout layer between routes and screens.
- **Screens as orchestrators over props-only views.** Today's components both
  fetch and render; the target splits them.

---

## 10. Local vs production — read before running anything

**The CLI is linked to the hosted project.** The dangerous commands look almost
identical to the safe ones.

| Command | Acts on |
|---|---|
| `supabase start` / `stop` / `status` | local only |
| `supabase db reset` | **local** — wipes and re-seeds it |
| `supabase db reset --linked` | **PRODUCTION — wipes it.** Never |
| `supabase db push` | **the linked project**, unless `--local` |
| `supabase db push --include-seed` | **PRODUCTION, including seed.sql.** Never |

`grep VITE_SUPABASE_URL .env.local` is the whole check for which backend the app
is pointed at. There is no staging project and the app has no undo.

> ⚠️ **Migration `0022` has not been applied to production.** It drops 17
> tables, 10 columns and 4 functions, adds 4 columns, renames 1, and rebuilds 3
> function bodies. It is irreversible and there is no staging project. It should
> go deliberately, with `--dry-run` first — not as a side effect of other work.
>
> One statement in it needs care: the copy from `event_person` into
> `event_series.attendees`. `db reset` does **not** exercise it, because the seed
> runs after migrations, so the junction table is empty locally. It was tested
> separately against a reconstructed pre-migration state. It copies first and
> drops last, so a failure before the drop loses nothing.
