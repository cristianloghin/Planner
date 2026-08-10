# Architecture — Domain / Route / Service

**Status: target state. Not yet implemented.** This document defines the structure
the app is moving to, and the rules that keep it there. It is not a migration
runbook — sequencing is deliberately out of scope.

**Assumed prerequisite:** `@mikrostack/router` gains base-path support (the app is
served from `https://<user>.github.io/Planner/`). Tracked separately; this document
assumes it is done.

---

## 1. The pattern

Six layers with a single permitted direction of dependency:

```
client/     → nothing                                  owns the network boundary
domains/    → client, assets                           data functions + dumb domain UI
services/   → assets                                   self-contained; fed by routes
layouts/    → assets                                   presentational, slotted
routes/     → domains, services, layouts, assets       the only orchestrators
assets/     → nothing                                  shared UI, styles, utils
```

Two rules carry most of the weight:

- **Domain components never call domain data functions.** They receive props.
- **Services never reach into domains.** The route provides what they need.

Everything else in this document follows from those two, plus the direction of the
arrows above.

### Why

The current structure has one strong boundary and several missing ones. No
component imports `src/store/`, and `database.types.ts` is confined to two files —
so Postgres row shapes never leak into the UI. That property is preserved below and
should be treated as load-bearing.

What is missing:

- **Two parallel data stacks.** A reducer + `ScheduleStore` + hand-rolled write
  queue for most slices, TanStack Query for templates and occurrence state. Two
  caches, two offline mechanisms, two realtime paths.
- **No horizontal separation.** `components/` is flat and mixes screens, feature
  pieces, primitives and app chrome. `lib/` mixes pure domain logic, React hooks,
  infrastructure and data access.
- **No routes.** Navigation is `useState<Tab>` in `App.tsx`. No URLs, no code
  splitting, no error boundaries.
- **Identity-bearing providers.** `<AppProvider key={accountId}>` remounts the
  entire data layer when the account resolves, because the provider holds mutable
  identity.

---

## 2. Layers

### `client/`

The only place `@supabase/supabase-js` is imported. Exports plain async functions —
no React, no Query — that are passed to `useQuery`/`useMutation` by domains.

Also owns the **anti-corruption layer**: DB↔domain translation lives here
(`startToTs`, `tsToStart`, `durationToInterval`, `intervalToMinutes`,
`rebuildAttachments`, the `fetchAll` pagination helper). This is what keeps
`database.types.ts` from leaking upward.

RPCs become named exports (`createAccount`, `splitSeries`, `searchEvents`,
`searchListItems`), so the entire server surface is enumerable in one folder.

Cross-cutting request concerns belong here too, via the SDK's `global.fetch`
option: network-error classification and transport retry. Today `isNetworkError`
lives in `store/offline.ts` and the retry loop lives in `state.tsx` — the state
layer knows about transport errors only because there is nowhere else to put that
knowledge.

> Note: this SDK version (2.108) added `db.timeout` and `db.retry` (default `true`).
> Some hand-rolled retry may be redundant — verify rather than port.

### `domains/`

Each domain owns one slice: its queries, its mutations, its selectors, its
optimistic patch functions, its types, and its dumb domain-specific components.

**Selectors run over the cache, never duplicate it.** Query's `select` is the
mechanism: it is memoized per observer with structural sharing, so a consumer
re-renders only when its *selected output* changes. `usePersonColor(id)` is a
`useQuery` with a `select`, not a copy of the roster.

Domains: `account`, `auth`, `events`, `lists`, `occurrences`, `people`,
`preferences`, `search`, `templates`.

### `routes/`

The only orchestrators. A route reads params, calls domain hooks, feeds services,
and passes plain data to dumb components. It composes a Layout.

Route components are **thin shells over props-only view components** (see rule R15).

### `layouts/`

Repeatable page structure, presentational only, slotted. The router's nested routes
provide this natively: a parent route receives its matched child as `outlet` and is
not remounted when navigating between children.

`ViewHeader` is already a Layout in everything but name — presentational, three
named slots (`nav`, `rightExtra`, `children`), shared by Day/Week/Month.

### `services/`

Self-contained modules called by routes. A service may be a store, a hook, or a
pure engine. It never imports from `domains/` or `client/`.

`lib/` already contains three finished engines that only need moving:
occurrence expansion (`recurrence`/`rrule`/`occurrences`), block layout
(`timelineLayout`), and supervision checks (`conflicts`). They already take data in
and return derived data — which is exactly the service contract.

### `assets/`

Truly shared UI (`Spinner`, `ConfirmDialog`, `NumberField`, `ColorPicker`,
`CommitTextInput`, `SearchOverlay`, `ScopeSheet`), app styles and design tokens,
and generic utilities and hooks. Imports nothing from the app.

---

## 3. Target structure

```
src/
├── main.tsx                    entry: QueryClient(persist) → session → router
├── queryClient.ts              client + persister config
├── sw.ts                       PWA service worker
│
├── client/
│   ├── supabase.ts             the single SDK import + custom fetch
│   ├── database.types.ts       generated; never imported above this folder
│   ├── mappers.ts              DB ↔ domain translation
│   ├── pagination.ts           fetchAll
│   ├── events.ts               series/attendee/attachment reads + writes
│   ├── lists.ts
│   ├── occurrences.ts          windowed reads, status/tick/override writes
│   ├── people.ts
│   ├── preferences.ts
│   ├── templates.ts
│   ├── account.ts              account_member, create_account
│   ├── search.ts               search_events, search_list_items
│   └── push.ts                 push_subscriptions rows
│
├── domains/
│   ├── account/                queries, keys
│   ├── auth/                   signIn/signUp/signOut/updatePassword
│   ├── events/                 queries, mutations, patches, selectors,
│   │                           components/ (EventCard, TimeGutter, AttachmentsEditor…)
│   ├── lists/
│   ├── occurrences/
│   ├── people/                 selectors (colour resolution), components/ (Avatars, AttendeeChips)
│   ├── preferences/
│   ├── search/
│   └── templates/
│
├── routes/
│   ├── routes.ts               defineRoutes map
│   ├── login/
│   ├── day/  week/  month/
│   ├── lists/
│   ├── settings/
│   ├── event/                  new + edit
│   └── occurrence/
│
├── layouts/
│   ├── AppShell.tsx            tab bar, AlertHost, SyncBanners, UpdatePrompt
│   ├── CalendarViewLayout.tsx  ← ViewHeader
│   └── SettingsLayout.tsx
│
├── services/
│   ├── session/                session + non-React accessors
│   ├── realtime/               table → query-key invalidation bridge
│   ├── recurrence/             ← recurrence, rrule, occurrences
│   ├── timeline-layout/        ← timelineLayout
│   ├── conflicts/              ← conflicts
│   ├── gestures/               ← useSwipeGestures
│   ├── notifications/          ← notifications, AlertHost logic
│   └── push/                   ← push
│
└── assets/
    ├── ui/                     Spinner, ConfirmDialog, ScopeSheet, ColorPicker,
    │                           NumberField, CommitTextInput, SearchOverlay, SearchField
    ├── hooks/                  useLatest, useMediaQuery, useSearch
    ├── utils/                  dates, id, cx
    ├── palette.ts
    └── styles/                 tokens.css, swatches.css, shared.module.css
```

---

## 4. Routes

```
/login                              guard: redirect away when authenticated
/day                                ?date=
/week                               ?weekStart=
/month                              ?month=
/lists                    + index   list picker
/lists/:listId
/settings                 + index
/settings/people
/settings/templates
/settings/templates/:id
/settings/notifications
/event/new                          ?date&attendees&allDay&startMin&endMin
/event/:seriesId/edit
/occurrence/:seriesId/:date         the sheet, as a page
/occurrence/:seriesId/:date/edit    parent: null
```

**Everything addressable is a route.** `EventEditor` already renders full-screen —
its own comment notes the shell covers the whole screen and Cancel is the only way
out — so it is a page that simply isn't addressable today.

`EditorTarget` maps onto `useQueryState` directly. Its `new` branch
(`date: string`, `attendees: PersonId[]`, `allDay?: boolean`, `startMin?: number`,
`endMin?: number`) uses only natively-serialized types. Its `edit` branch currently
carries a whole `CalendarEvent`; as a route it carries `:seriesId` and re-derives
the event from the Query cache — a warm hit, since the linking view already fetched
that window.

**`/occurrence/:seriesId/:date/edit` needs `parent: null`.** Prefix inference would
otherwise make the sheet a layout wrapping the editor as its outlet, when the intent
is replacement.

**Not routes.** `ScopeSheet` is a step inside an uncommitted save flow — as a route
it would produce a URL representing a half-finished edit, reachable by refresh with
no draft behind it. `ConfirmDialog` is transient. `AlertHost`, `SyncBanners` and
`UpdatePrompt` are shell chrome, siblings of `RouterView`.

The auth gate becomes a route guard backed by `config.auth.isAuthenticated` reading
the session service, replacing the `Root` gate in `App.tsx`.

**Deployment:** `public/404.html` (a copy of `index.html`) is required. GitHub Pages
serves its own 404 for any unmatched path, so a cold visit to a deep link fails
before the service worker exists; the SW's SPA fallback only covers navigation after
install.

---

## 5. Rules

| # | Rule |
|---|---|
| R1 | Only `client/` imports `@supabase/supabase-js`. |
| R2 | Only `client/` imports `database.types.ts`. |
| R3 | Domain components never call domain data functions. They take props. |
| R4 | Services never import from `domains/` or `client/`. |
| R5 | Routes are the only orchestrators. |
| R6 | Layouts are presentational and slotted. They receive no data functions. |
| R7 | `assets/` imports nothing from the app. |
| R8 | Ambient state exposes only already-loaded, synchronously-derivable data. **If reading it can trigger I/O, it is a domain and the route must supply it.** |
| R9 | Mutation variables are fully serializable and self-sufficient — no closures over state. |
| R10 | Mutation behaviour is registered as defaults at module scope under a stable key. |
| R11 | Account-scoped writes carry `scope: { id: accountId }`. |
| R12 | Optimistic logic is a pure exported function, unit-tested; `onMutate` only calls it. |
| R13 | URL params carry identity (*what* is viewed), never view state (*how*). |
| R14 | `useQueryState` uses only `string`, `number`, `boolean`, `string[]`, `number[]`. |
| R15 | Route components are thin shells over props-only view components. |
| R16 | Every query key begins with its domain name and includes `accountId`. |

R8 is the one that erodes first. Without it, "ambient" becomes the loophole that
swallows the pattern — someone puts a fetch behind an accessor hook and the arrows
reverse.

---

## 6. Mechanisms

### One data path

Everything server-owned goes through TanStack Query. The reducer, the `Action`
union, `AppState`, `ScheduleStore` and the hand-rolled write queue all dissolve.

### Ordered writes

Query v5 mutation `scope` provides this natively. `MutationCache.canRun` allows only
the head of a scope to be pending, and `runNext` continues the next paused mutation
in the same scope on completion. Hydration restores mutations in dehydrated order,
so a replay after a cold start preserves the original sequence — `resumePausedMutations()`
resolves them via `Promise.all`, but scoped mutations re-serialize through `canRun`.

`scope: { id: accountId }` reproduces today's single ordered pump, so dependent
writes ("create a list, then add its items") remain safe. Per-domain scopes would
allow cross-domain parallelism; account-wide is the faithful starting point.

### Offline durability

Query's cache persister already dehydrates paused mutations and
`resumePausedMutations()` resumes them — this is proven in the app today for
occurrence writes. Extending it to every write is what R9 and R10 exist to enforce.

The localStorage snapshot and action queue in `store/offline.ts` are replaced by the
persister. One mechanism.

### Ambient state

Query + `select`. `select` needs stable function identity or it recomputes each
render.

`accountId` becomes an ordinary query: `queryClient.fetchQuery` dedupes in-flight
requests by key and is readable outside React, which is exactly what
`ensureAccount`'s hand-rolled `inFlight` map does today. That map deletes.

### Realtime

One service mapping changed table → invalidated query keys, replacing both current
paths (`SupabaseStore.subscribe` routed through `state.tsx`, and
`useTemplatesRealtime`).

### Edit guard

Deletes. `beginEdit`/`endEdit` exist to defer realtime reloads while an editor is
open; once editors are routes, "an editor is open" is derivable from the URL via
`useRoute(...).matched`. `usePrompt` covers the separate concern of blocking
navigation away from a dirty draft.

### Navigation state

`weekStart`/`selectedDay` move to the URL. They are already excluded from the
persisted snapshot as "per-session navigation" — they were never data.

Week layout (cards vs timeline) stays a per-user preference, and pinch zoom (`hourH`)
stays in localStorage. Both are *how*, not *what* (R13).

---

## 7. Where things go

### Dissolving

| File | Becomes |
|---|---|
| `App.tsx` | `Root` gate → route guard; tab shell → `layouts/AppShell`; route map → `routes/routes.ts` |
| `state.tsx` | reducer state → domains; write queue → mutation `scope`; offline → Query persister; realtime routing → `services/realtime`; edit guard → derived from route |
| `auth.tsx` | session + non-React accessors → `services/session`; credential ops → `domains/auth`; `ensureAccount` → `domains/account`; sign-out cache/snapshot clearing → shell orchestration |
| `store/store.ts` | deleted (`ScheduleStore`, `LocalStorageStore`, `defaultState`) |
| `store/supabaseStore.ts` | sliced into `client/*` by domain; mappers to `client/mappers.ts` |
| `store/reducer.ts`, `store/actions.ts` | deleted; optimistic logic → `domains/*/patch.ts` |
| `store/offline.ts` | deleted |
| `data/useAccountStore.ts` | deleted (client functions replace it) |
| `types.ts` | split into `domains/*/types.ts` |

Sign-out clearing is worth calling out as more than filing: `auth.tsx` currently
reaches into the query cache and the offline snapshot of every other domain from
inside its context value. That is the domain layer orchestrating, and it is the kind
of coupling that breaks quietly later.

### Moving

| From | To |
|---|---|
| `components/{DayView,WeekCalendar,WeekTimeline,MonthView,Lists,Settings,Login}` | `routes/*` — split into orchestrator + props-only view |
| `components/{EventEditor,OccurrenceSheet,TemplateEditor,NotificationSettings}` | `routes/*` |
| `components/{AttachmentsEditor,TimeGutter}` | `domains/events/components` |
| `components/{Avatars,AttendeeChips}` | `domains/people/components` |
| `components/{EventSearch,ListSearch}` | collapse into one `assets/ui/SearchField` over `domains/search` |
| `components/{Spinner,ConfirmDialog,ScopeSheet,ColorPicker,NumberField,CommitTextInput,SearchOverlay}` | `assets/ui` |
| `components/ViewHeader` | `layouts/CalendarViewLayout` |
| `components/{AlertHost,SyncBanners,UpdatePrompt}` | `layouts/AppShell` + backing services |
| `data/templates.ts` | `domains/templates` |
| `data/completions.ts` | `domains/occurrences` |
| `lib/{supabase,database.types}.ts` | `client/` |
| `lib/search.ts` | `client/search.ts` + `domains/search` |
| `lib/push.ts` | `client/push.ts` + `services/push` |
| `lib/{recurrence,rrule,occurrences}.ts` | `services/recurrence` |
| `lib/timelineLayout.ts` | `services/timeline-layout` |
| `lib/conflicts.ts` | `services/conflicts` |
| `lib/notifications.ts` | `services/notifications` |
| `lib/useSwipeGestures.ts` | `services/gestures` |
| `lib/{people,attachments,lists,timing}.ts` | domain selectors in `domains/{people,events,lists}` |
| `lib/{useLatest,useMediaQuery,useSearch}.ts` | `assets/hooks` |
| `lib/{dates,id,cx}.ts` | `assets/utils` |
| `lib/palette.ts` | `assets/palette.ts` |
| `styles/` | `assets/styles/` |

`supabase/` (migrations, edge functions) is unchanged. Note that
`supabase/functions/send-reminders/` already splits its Deno handler from pure
`logic.ts`, and `lib/reminderSenderLogic.test.ts` reaches across to test it — that
handler/logic split is the shape `client/` and `services/` are adopting.

---

## 8. Known hard spots

**Mutation variables must become self-sufficient.** This is the bulk of the work.
`apply(action, next)` currently receives the whole next `AppState` and resolves
entities out of it (`next.events.find(...)`). A dehydrated paused mutation has no
state to resolve against — only its serialized variables. The existing
`OccurrenceWrite` union in `data/completions.ts` is the correct template; the rest of
the action vocabulary must be rewritten to that standard.

**Preserving reducer test coverage.** `store/reducer.test.ts` (257 lines) tests pure
optimistic application. Moving that logic into inline `onMutate` callbacks would
silently delete it. R12 exists to prevent that: each domain exports pure `patch*`
functions — `patchEntry` in `completions.ts` is the existing example — and the tests
port over nearly as-is.

**`splitSeries` is the riskiest single item.** It is an RPC, plus follow-up row
writes, plus an optimistic clone that only reconciles via a full reload. As one
mutation with a multi-step `mutationFn`, its optimistic patch is genuinely awkward.
Consider letting it reconcile by invalidation rather than patching optimistically.

**`load()` decomposition.** The reducer stack reads the entire `AppState` in one
call. Per-domain queries replace it. Windowing events by date range (as occurrences
already are) is an opportunity, not a requirement — treat it as separate scope.

**Legacy lists migration.** `supabaseStore.ts` reads `planner.lists.v1` from
localStorage once to import pre-migration items. Decide explicitly whether to carry
it forward or drop it.

**StrictMode.** `main.tsx` runs `StrictMode`, and the codebase already carries scar
tissue from it — the `inFlight` map in `auth.tsx` exists because double-mount created
duplicate accounts. Service instances must be created once in a factory the provider
calls lazily, and `subscribe` must be idempotent under double-invocation.

**Duplication to retire.** `EventSearch` (79 lines) and `ListSearch` (84) are
structurally identical modulo entity names. `Lists.tsx` (714) is list CRUD, item
CRUD, edit mode, dialogs and search in one file. `styles/shared.module.css`
(314 lines, ~40 classes, imported by 14 files) is a parallel un-componentized
primitive library — some shared UI is a component, some is a class, with no rule for
which. `Lists.tsx` reaching into `./Dialog.module.css` as `d` is a symptom of the
missing dialog primitive.

---

## 9. Deferred: workspaces

Workspaces (`@mikrostack/router`'s multi-instance view sessions) are possible future
work, not designed for here. One decision is worth banking now because it is not
free later.

**Horizontal swipe is already taken.** `useSwipeGestures` is wired into `DayView`,
`WeekCalendar`, `WeekTimeline` and `MonthView` as a hand-rolled three-page deck
(`pageIdx === 1` centre, `pageInert()` on off-screen pages) with pinch-zoom, on
`touchmove` with `{ passive: false }`. The swipe adapter arranges workspaces
side-by-side on the same axis — a deck inside a deck, with the outer scroll
container fighting the inner gesture.

Date swipe is the app's primary interaction and should not yield. That points at the
stack adapter with explicit switching UI: containers are headless, and
`useWorkspaceContainer()` exposes the scroll element precisely so app code can drive
the deck from its own selector.

**Do not use `adapter: "auto"`** — it resolves to `swipe` on touch devices, which is
every device this app targets.

Nothing else is required now. R13, R14 and R15 already carry the cost of keeping the
door open: params stay identity-only and schema-shaped, and a route whose view is
props-only is promoted to a workspace by writing a second thin wrapper.

---

## 10. Open questions

- Per-domain mutation scopes instead of account-wide, if write throughput ever
  matters.
- Whether `/search?q=` becomes a route (deep-linkable results) or stays an overlay
  invoked from the shared header.
- Whether events get windowed reads like occurrences, or stay whole-account.
- Whether the legacy `planner.lists.v1` import is carried forward.
