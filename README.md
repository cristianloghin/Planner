# Planner

A small PWA for two people to plan and coordinate their week — a shared weekly
calendar, to-do lists, and per-person colours. Installable, works offline.

**Phase 1:** ran entirely in the browser, persisted to `localStorage` — single
device, no accounts.

**Phase 2 (in progress):** the app now runs on a real backend (Supabase) with
accounts, auth, and cross-device sync. Sign-in is required; calendar data
(people, events, attendees, reminders, completions) is stored per account and
shared between partners. The whole app talks to storage through the
`ScheduleStore` interface in [`src/store/store.ts`](src/store/store.ts), now
backed by `SupabaseStore`.

People are **data**: one calendar lane per `person` row (`adult`/`child`,
optional login link), so the app works for any number of people.

Done so far: backend stood up, auth + account bootstrap, `SupabaseStore` for
people/events/completions, and **realtime sync** (a partner's change appears
live, deferred while you're mid-edit). Not yet: standalone Lists sync (still
device-local) and `dependsOn` edges.

- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — the schema and the reasoning behind every decision.
- [`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md) — runbook + current status and remaining work.
- [`supabase/migrations/`](supabase/migrations) — schema, RLS, functions, grants, and the `person` model.

## Tech

- Vite + React + TypeScript
- `vite-plugin-pwa` for the manifest + offline service worker
- Deployed to GitHub Pages via GitHub Actions

## Develop

Create `.env.local` (gitignored) with your Supabase project credentials:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup in the repo: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

The app is served from `https://<user>.github.io/Planner/`. That subpath is set
as `base` in [`vite.config.ts`](vite.config.ts) — keep it in sync with the repo
name if the repo is ever renamed.
