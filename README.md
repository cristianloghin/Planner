# Planner

A small PWA for two people to plan and coordinate their week — a shared weekly
calendar, to-do lists, and per-person colours. Installable, works offline.

**Phase 1:** ran entirely in the browser, persisted to `localStorage` — single
device, no accounts.

**Phase 2 (shipped):** the app runs on a real backend (Supabase) with accounts,
auth, and cross-device sync. Sign-in is required; calendar data (people, events,
attendees, reminders, completions) is stored per account and shared between
partners.

People are **data**: one calendar lane per `person` row (`adult`/`child`,
optional login link), so the app works for any number of people.

Built and live: auth + account bootstrap, **realtime sync** (a partner's change
appears live, deferred while you're mid-edit), **occurrence dependencies** (link
an occurrence to a concrete occurrence of another event), **standalone Lists**
(named account-scoped lists with in-list headers, per-item deadlines, and to-dos
linkable to an occurrence so ticking in either place is one write), **event
templates** (reusable series shells you save from the editor and start a new
event from), a **unified 12-colour palette** shared by people and events with
per-user overrides, **full-text search** over events and to-dos, and **Web Push
reminders** that arrive while the app is closed.

The codebase is mid-restructure. Most of the app still runs through the
`ScheduleStore` interface in [`src/store/store.ts`](src/store/store.ts), with
templates on TanStack Query. Alongside it sit `client/` (every Supabase call),
`domains/` (queries, mutations and the pure logic around them), `services/` (the
engines, hooks and stores) and `assets/` — all built, and **one of them
adopted**: per-occurrence state now reads and writes through
`domains/occurrences`, which was the first time any of this touched the database.
The five tabs are real routes; `layouts/` is still ahead, as is splitting the
screens into orchestrators over props-only views. See
[`docs/STATUS.md`](docs/STATUS.md) for what that means in practice, and
[`docs/RESTRUCTURE_PLAN.md`](docs/RESTRUCTURE_PLAN.md) for where it lands.

- [`docs/STATUS.md`](docs/STATUS.md) — what's built, how the data layer stands today, and the gotchas.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — the schema and the reasoning behind every decision.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the DRSp pattern: layers, rules, and where new code goes.
- [`docs/RESTRUCTURE_PLAN.md`](docs/RESTRUCTURE_PLAN.md) — DRSp applied to this codebase (target state, in progress).
- [`docs/PLANNED.md`](docs/PLANNED.md) — designed but not built: shares & pins, private lists, the note model.
- [`docs/PUSH_NOTIFICATIONS.md`](docs/PUSH_NOTIFICATIONS.md) — Web Push setup, verification, and failure modes.
- [`docs/NOTE_MODEL.md`](docs/NOTE_MODEL.md) — a richer note/document model (design only).
- [`supabase/migrations/`](supabase/migrations) — schema, RLS, functions, grants, and the `person` model.

## Tech

- Vite + React + TypeScript
- `vite-plugin-pwa` for the manifest + offline service worker
- Deployed to GitHub Pages via GitHub Actions

## Develop

There are two backends you can run against, and it matters which one you pick.

### Against a local backend — do this by default

The whole backend runs in Docker, from the same images as the hosted project.
Nothing you do here can reach production.

```bash
supabase start
```

That applies migrations `0001`–`0021` to a fresh database and then
[`supabase/seed.sql`](supabase/seed.sql), which creates an account with two
adults, a child, a few events (one weekly with two checklists), two lists and a
blueprint — enough that every screen has something on it.

Put what `supabase status` prints (the `PUBLISHABLE_KEY`) into `.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable key from `supabase status`>
```

Then `npm run dev` and sign in as **dev@planner.test** / **password123**.

- **Studio** is on `:54323` — browse and edit the data directly.
- **Inbucket** is on `:54324` — auth email goes there, not to a real inbox. That
  is where the confirmation link lands if you sign up through the app instead of
  using the seeded login.
- `supabase db reset` re-applies migrations and the seed, giving you the same
  account back.
- `supabase stop` when you are done.

Two things localhost cannot reproduce: the `pg_cron` beat from migration `0019`
that triggers the reminder sender, and iOS push, which needs the app added to the
Home Screen. Run the sender by hand instead:

```bash
supabase functions serve send-reminders
```

### Against the hosted project — only when you mean it

Point `.env.local` at your project ref and publishable key (see
[`docs/STATUS.md`](docs/STATUS.md) for standing one up). Everything you do then
is real: **there is no staging project, and the app has no undo.** Deleting a
list deletes it for your partner too.

### Not corrupting production

The dangerous commands are the ones that act on the **linked** project, and they
look almost identical to the local ones:

| Command | Acts on |
|---|---|
| `supabase start` / `stop` / `status` | local only |
| `supabase db reset` | **local** — wipes and re-seeds it |
| `supabase db reset --linked` | **PRODUCTION — wipes it.** Never run this |
| `supabase db push` | **the linked project**, unless you pass `--local` |
| `supabase db push --include-seed` | **PRODUCTION, including seed.sql.** Never run this |
| `supabase link` | changes which project all of the above mean |

Applying migrations with `db push` is the one thing that legitimately goes to
production. Use `--dry-run` first; it prints what would be applied and changes
nothing.

Note the two `--include-seed` and `--linked` rows: the seed is **not** inherently
local. It is local because of how it is normally run, and those flags are enough
to put development data into the real database.

Two habits worth keeping:

**Check which backend you are on before you click anything destructive.** The app
gives no visual clue. `grep VITE_SUPABASE_URL .env.local` is the whole check.

**Clear site data when you switch.** The query cache lives in localStorage under
`planner.queryCache.v1` and the offline snapshot is keyed by account id — so the
same origin pointed at a different database will render the previous account's
data before the first fetch lands. It looks like data loss and is not.

### Testing what actually gets deployed

`npm run dev` is not a rehearsal. The base path (`/Planner/`), the service worker
built from `src/sw.ts`, and the generated icons only exist in a real build:

```bash
npm run build && npm run serve:pages
```

`serve:pages` serves `dist/` the way GitHub Pages does, and specifically does
**not** rewrite unknown paths to `index.html`. `npm run preview` does, which
hides the failure worth catching: Pages serves `404.html` for any path it has no
file for. The build copies the built `index.html` to `404.html` so a cold visit
to a deep link still boots the app — open one in a fresh tab and you should get
a 404 status with the app rendering anyway, which is what a real visitor
following a shared link gets.

### Everything else

```bash
npm install
npm run dev         # dev server
npm run build       # type-check + production build to dist/ (+ 404.html)
npm run preview     # vite's preview — convenient, but rewrites unknown paths
npm run serve:pages # serves dist/ as GitHub Pages does
npm test            # the unit suite (vitest, no backend needed)
npm run test:watch
npm run typecheck
npm run lint
```

`npm test` is 238 tests and needs no backend. It covers the pure, hand-rolled
logic that is easiest to get quietly wrong: recurrence expansion and occurrence
status (`src/services/recurrence/`), the RRULE round-trip (`src/lib/rrule.ts`),
date math (`src/assets/utils/dates.ts`), the DB↔app conversions
(`src/client/mappers.ts`), each domain's transformers, selectors and optimistic
patches (`src/domains/*/`), the session and realtime stores
(`src/services/{session,realtime}/`), the reducer's optimistic application and
the offline write queue (`src/store/`), and a cross-validation of the reminder
sender's recurrence logic against the app's.

What it does **not** cover is any round trip to the database. That still needs a
click-test — which is what the local backend above is for. The occurrence reads
and writes have had one; nothing else in `client/` has.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup in the repo: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

The app is served from `https://<user>.github.io/Planner/`. That subpath is set
as `base` in [`vite.config.ts`](vite.config.ts) — keep it in sync with the repo
name if the repo is ever renamed.
