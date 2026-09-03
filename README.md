# Planner

A small PWA for a household to plan and coordinate their week — a shared weekly
calendar with a lane per person. Installable, works offline.

Sign-in is required. Everything is scoped to an **account**, which is the sharing
boundary: people, events and preferences belong to one, and a partner's change
appears live.

**What it does**

- Day / Week / Month views, one calendar lane per person
- Repeating events, with a user-set end — *after N times* or *on a date*
- Per-occurrence overrides: move a single day, cancel it, or change who is on it
  without touching the rest of the series
- Event templates, to start a new event from a saved shape
- Reminders: in-app while the tab is open, Web Push while it is closed
- Full-text search over event titles
- A twelve-colour palette shared by people and events, with per-user overrides

People are **data**: one lane per `person` row. There is no kind of person and
nothing follows from who is on an event — it is just who is on it.

## Docs

- [`docs/DEV.md`](docs/DEV.md) — the schema, how data moves, the gotchas,
  testing, push setup, and what is safe to run. **Start here.**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the DRSp pattern: layers,
  rules, where new code goes.
- [`docs/NOTE_MODEL.md`](docs/NOTE_MODEL.md) — a richer note/document model
  (design only, next up).
- [`docs/archive/`](docs/archive/README.md) — superseded docs, kept for their
  reasoning. Not current.
- [`supabase/migrations/`](supabase/migrations) — schema, RLS, functions, grants.

## Tech

- Vite + React + TypeScript
- TanStack Query for reads, writes and the offline queue
- Supabase for auth, data, realtime and the reminder sender (a Deno edge function)
- `vite-plugin-pwa` for the manifest and offline service worker
- Deployed to GitHub Pages via GitHub Actions

## Develop

There are two backends you can run against, and it matters which one you pick.

### Against a local backend — do this by default

The whole backend runs in Docker, from the same images as the hosted project.
Nothing you do here can reach production.

```bash
supabase start
```

That applies the migrations to a fresh database and then
[`supabase/seed.sql`](supabase/seed.sql), which creates an account with three
people and enough events that every screen has something on it: a weekly event,
a one-off spanning two days, a series that ends after five times, one that ends
on a date, a template, and one day whose people differ from its series.

Put what `supabase status` prints into `.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable key from `supabase status`>
```

Then `npm run dev` and sign in as **dev@planner.test** / **password123**.

- **Studio** on `:54323` — browse and edit the data directly.
- **Inbucket** on `:54324` — auth email goes there, not to a real inbox.
- `supabase db reset` re-applies migrations and the seed. Note this signs you
  out: the auth user is recreated, so the session token stops matching.
- `supabase stop` when you are done.

### Against the hosted project — only when you mean it

Point `.env.local` at the project ref and publishable key. Everything you then
do is real: **there is no staging project, and the app has no undo.** Deleting
something deletes it for your partner too.

**Check which backend you are on before clicking anything destructive.** The app
gives no visual clue. `grep VITE_SUPABASE_URL .env.local` is the whole check.

**Clear site data when you switch.** The query cache and offline snapshot are
per-origin, so the same origin pointed at a different database shows the previous
account's data until the first fetch lands. It looks like data loss and is not.

The commands that act on the **linked** project — and migration `0022`, which has
not been applied there yet — are in
[`docs/DEV.md` §10](docs/DEV.md#10-local-vs-production--read-before-running-anything).
Read it before running any `supabase db` command.

### Testing what actually gets deployed

`npm run dev` is not a rehearsal. The base path (`/Planner/`), the service worker
from `src/sw.ts`, and the generated icons only exist in a real build:

```bash
npm run build && npm run serve:pages
```

`serve:pages` serves `dist/` the way GitHub Pages does, and specifically does
**not** rewrite unknown paths to `index.html` — which is the failure worth
catching. Pages serves `404.html` for any path it has no file for, and the build
copies `index.html` there so a cold visit to a deep link still boots the app.

### Everything else

```bash
npm install
npm run dev         # dev server
npm run build       # type-check + production build to dist/ (+ 404.html)
npm run serve:pages # serves dist/ as GitHub Pages does
npm test            # the unit suite (vitest, no backend needed)
npm run typecheck
npm run lint
npm run gen:types   # regenerate client/database.types.ts from the LOCAL database
```

`npm test` is 170 tests and needs no backend. What it does **not** cover is any
round trip to the database — that still needs a click-test against the local
stack. See [`docs/DEV.md` §6](docs/DEV.md#6-tests).

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`, and deploys the reminder function.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. Push notifications need their own one-time setup — see
[`docs/DEV.md` §7](docs/DEV.md#7-push-notifications).

The app is served from `https://<user>.github.io/Planner/`. That subpath is
`base` in [`vite.config.ts`](vite.config.ts) — keep it in sync with the repo name.
