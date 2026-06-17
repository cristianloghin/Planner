# Planner

A small PWA for two people to plan and coordinate their week — a shared weekly
calendar, to-do lists, and per-person colours. Installable, works offline.

**Phase 1 (current):** runs entirely in the browser. State is kept in memory and
persisted to `localStorage`, so it survives refreshes but lives on a single
device. No accounts, no backend.

**Phase 2 (later):** swap the storage layer for a real backend (e.g. Supabase /
Firebase) to sync schedules across devices and between both partners. The whole
app talks to storage through the `ScheduleStore` interface in
[`src/store/store.ts`](src/store/store.ts), so adding sync is a localized change.

## Tech

- Vite + React + TypeScript
- `vite-plugin-pwa` for the manifest + offline service worker
- Deployed to GitHub Pages via GitHub Actions

## Develop

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
