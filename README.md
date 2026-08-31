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

The data layer is mid-migration: most slices still flow through the
`ScheduleStore` interface in [`src/store/store.ts`](src/store/store.ts), while
templates and per-occurrence state are owned by TanStack Query, and a `client/`
layer holds the Supabase SDK and the DB↔app conversions. See
[`docs/STATUS.md`](docs/STATUS.md).

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

Create `.env.local` (gitignored) with your Supabase project credentials:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# Optional — Web Push. Generate a key pair once with
# `npx web-push generate-vapid-keys`; the PUBLIC key goes here (and in the
# repo's Actions variables as VITE_VAPID_PUBLIC_KEY for deploys), the private
# key stays with the reminder sender. Unset = the notifications section in
# Settings doesn't render.
VITE_VAPID_PUBLIC_KEY=B...
```

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
npm test         # run the unit suite (vitest, no backend needed)
npm run test:watch
```

`npm test` covers the pure, backend-free logic — recurrence expansion
(`src/lib/recurrence.ts`), the RRULE round-trip (`src/lib/rrule.ts`), occurrence
completion/dependency gating (`src/lib/occurrences.ts`), the Lists helpers
(`src/lib/lists.ts`), date math, the reducer's optimistic application, the
offline write queue, the DB↔app conversions (`src/client/mappers.ts`), and a
cross-validation of the reminder sender's recurrence logic against the client's.
These run without Supabase, so they guard the trickiest hand-rolled date math on
every change.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup in the repo: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

The app is served from `https://<user>.github.io/Planner/`. That subpath is set
as `base` in [`vite.config.ts`](vite.config.ts) — keep it in sync with the repo
name if the repo is ever renamed.
