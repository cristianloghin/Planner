# DRSp — the Domain / Route / Service pattern

A way of structuring React applications around **one direction of data flow**.

This document defines the pattern itself: its primitives, the rules between them,
and how to decide where a given piece of code belongs. It is project-agnostic —
Planner is the reference implementation, and
[`RESTRUCTURE_PLAN.md`](./RESTRUCTURE_PLAN.md) is where the pattern is applied to
this codebase specifically.

---

## 1. The problem it solves

Most React codebases are organised **by kind**: `components/`, `hooks/`, `utils/`,
`lib/`, `api/`. That is a filing system, not an architecture. It answers "what type
of thing is this?" and nothing else. In particular it does not answer:

- Where does this new code go?
- What is allowed to import what?
- Which layer owns this piece of state?

Because nothing is forbidden, everything happens. The recognisable end states:

- **Fetch-in-component.** A component fetches its own data, so it can only be
  rendered where that fetch makes sense, and nesting two of them serialises their
  requests into a waterfall.
- **The god context.** One provider accumulates every cross-cutting concern until
  any change to it re-renders the app.
- **The grab bag.** `utils/` or `lib/` becomes the place for anything that isn't a
  component — pure functions, React hooks, network calls and singletons side by
  side, with no rule about which may depend on which.
- **Untestable screens.** The only way to test a view is to mount it with a server,
  a router and four providers, so it doesn't get tested.

Each of these is a *symptom of the same cause*: the dependency graph is
unconstrained.

**DRSp's claim is narrow and mechanical.** Fix the direction of dependencies, name
the layers along that direction, and most placement questions stop being judgement
calls — the answer becomes derivable from what a piece of code is allowed to touch.

---

## 2. The primitives

| Layer | Owns | May import | Must never |
|---|---|---|---|
| **Client** | The network boundary | *nothing* | Know about React, or about any layer above it |
| **Domain** | Data for one slice: fetching, mutations, selectors, plus dumb domain-specific UI | Client, Assets | Have its components call its own data functions |
| **Route** | Orchestration | Domain, Service, Layout, Assets | Contain reusable UI or data logic worth extracting |
| **Service** | A self-contained capability: a store, a hook, an engine | Assets | Reach into a Domain or the Client |
| **Layout** | Repeatable page structure | Assets | Receive or touch data |
| **Assets** | Truly shared UI, styles, generic utilities | *nothing* | Know any domain type |

### Client

The single place the outside world is touched. Often generated — from an
`openapi.json` spec, a schema, or a typed SDK — and hand-extended where the
generator falls short.

It exports **plain functions**: no React, no cache library. Those functions are what
the Domain layer hands to its query and mutation hooks.

The Client also owns the **anti-corruption layer**: translation between wire shapes
and domain shapes. This is what keeps generated types — which change whenever the
backend changes — from leaking into components. If a generated type appears above
`client/`, the boundary has already failed.

Cross-cutting *transport* concerns live here too: auth headers, network-error
classification, retry, logging. Anything every request needs.

### Domain

One domain owns one slice of the application's data, completely:

- **Queries** — reads, and their cache policy
- **Mutations** — writes, and their optimistic behaviour
- **Selectors** — derived views over cached data
- **Types** — the domain's own shapes
- **Components** — small, domain-specific pieces of UI

**Selectors read the cache; they never copy it.** If the data is already cached,
derive from it rather than duplicating it into a second store. Duplication is how
two sources of truth get created, and the second one is always the stale one.

**Domain components are dumb.** They take props and render. They do not call the
domain's own hooks, even though those hooks are file-adjacent. This is the rule
people find most arbitrary and it is the one that pays for itself most often:

- A component that fetches can only be rendered where that fetch is valid. A
  component that takes props renders anywhere.
- Nested fetching components serialise into waterfalls; a route that fetches once
  and passes down does not.
- Props-only components test without a server, a cache, or a provider.
- The route becomes the single place that answers "what does this screen load?"

### Route

The orchestrator, and the **only** layer permitted to be one. A route:

1. reads its params,
2. calls domain hooks,
3. feeds services what they need,
4. passes plain data down to dumb components,
5. composes a layout.

Routes are where the app is wired together, which means they are allowed to be
boring and specific. A route should contain nothing worth reusing — the moment it
does, that thing belongs in a domain, service, layout, or asset.

Keep routes **thin shells over props-only views**. The orchestration lives in the
route; the rendering lives in a component that takes plain props. This keeps the
view testable, and it means changing *how* a view is reached — a different route, a
modal, a panel, a multi-instance workspace — is a change to the shell, not to the
view.

### Service

A self-contained capability that a route calls. A service can be:

- a **store** (client state with a lifecycle),
- a **hook** (a behaviour: gestures, media queries, timers),
- an **engine** (a pure transformation with real domain meaning: recurrence
  expansion, layout solving, conflict detection, pricing).

**Services are fed, not self-serving.** A service never reaches into a domain; the
route provides what it needs. This is what keeps a service testable in isolation and
reusable across routes — and it is what prevents the cycle `domain → service →
domain`, which is the most common way a layered structure quietly becomes a graph.

The distinction that matters: a service that fetches its own data **is a domain**.
Call it one.

### Layout

Repeatable page structure. Presentational only, and normally **slotted**, so routes
pass different content into the same frame.

A layout receives `ReactNode`s and structural flags. It does not receive domain
objects, and it does not call hooks that produce data. If a layout needs to know
what it's rendering, it isn't a layout — it's a component, or the route's own
markup.

Nested routing gives layouts for free: a parent route renders structure and slots
its matched child in as an outlet, without remounting when the child changes.

### Assets

Genuinely shared, genuinely generic: the button, the spinner, the dialog, the design
tokens, the stylesheets, date and string helpers.

The test is **domain-ignorance**. `<Button>` and `formatDate()` would make sense in a
completely different application. `<EventCard event={...}>` would not — it knows a
domain type, so it belongs to that domain.

Assets import nothing from the app. That is what makes them safe to depend on from
everywhere.

---

## 3. The dependency graph

```
                 ┌──────────┐
                 │  Route   │  orchestrates
                 └────┬─────┘
        ┌─────────────┼─────────────┬──────────────┐
        ▼             ▼             ▼              ▼
   ┌────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐
   │ Domain │   │ Service  │   │ Layout │   │  Assets  │
   └───┬────┘   └────┬─────┘   └───┬────┘   └──────────┘
       │             │             │              ▲
       ▼             └─────────────┴──────────────┘
   ┌────────┐
   │ Client │
   └────────┘
       │
       ▼
    network
```

Every edge points down. There are no cycles, and this is the entire point — not
tidiness, but the guarantee that follows from it:

- **Any layer can be understood without reading the layers above it.**
- **Any layer can be tested by supplying the layer below it.**
- **A change to the backend stops at the Client. A change to a screen stops at the
  Route.**

A single violation is always locally convenient — one import, saving one prop. It is
globally corrosive because it converts a tree into a graph, and every guarantee
above is a property of the tree.

---

## 4. Invariants

The rules worth enforcing rather than remembering:

1. Only the Client imports the network SDK or generated API types.
2. Domain components never call domain data functions.
3. Services never import from Domains or the Client.
4. Layouts receive no data — only slots and structural props.
5. Assets import nothing from the app.
6. Routes are the only orchestrators.
7. Every mutation's variables are self-sufficient and serializable.
8. Optimistic logic is a pure, exported, tested function.
9. Selectors derive from the cache; they never duplicate it.
10. URL params carry identity, not view state.

Rules 7 and 8 look like implementation details and are not. Self-sufficient
variables are what make a write replayable — after a retry, after an offline pause,
after an app restart. A mutation that closes over live state cannot be replayed,
because the state it closed over is gone. Pure optimistic functions are what keep
that logic testable once it stops living in a reducer.

---

## 5. Data flow

### A read

```
Route
  ├─ reads params
  ├─ calls useThings()                  ← Domain
  │     └─ queryFn: fetchThings()       ← Client
  │           └─ mapper: wire → domain
  ├─ calls useThingSummary()            ← Domain selector, over the same cache
  ├─ feeds derived data to an engine    ← Service
  └─ renders <ThingList things={…} />   ← dumb Domain component
        └─ inside a <ListLayout>        ← Layout
```

Two properties fall out. The route is the only place that knows what this screen
loads. And `ThingList` can be rendered from any route, in any state, in a test, with
a literal array.

### A write

```
dumb component  ──onClick──▶  Route handler
                                 └─ calls useUpdateThing().mutate(vars)   ← Domain
                                       ├─ onMutate: patchThing(cache, vars)   ← pure, tested
                                       ├─ mutationFn: updateThing(vars)       ← Client
                                       └─ onSettled: invalidate
```

The dumb component raises an intent. It does not know what happens next, which is
why it survives the write mechanism changing underneath it.

---

## 6. Where does this go?

The questions that actually come up, and the test that settles each.

**Domain or Service?**
Does reading it cause I/O? → **Domain.** Does it transform data it was given? →
**Service.** An engine that needs server data is not a service that fetches; it is a
service the route feeds.

**Service or Assets utility?**
Would it make sense in an app with a completely different domain? → **Assets.** Does
it encode rules specific to this business? → **Service.** `debounce` is an asset;
"expand a recurrence rule into occurrences" is a service.

**Route or Layout?**
Does it take data as props? Then it is not a layout. Layouts take slots.

**Domain component or Assets UI?**
Does its prop types mention a domain type? → **Domain.** `<Button variant>` is an
asset; `<EventCard event>` is not.

**Domain or Route?**
Is it reusable across screens? → **Domain.** Is it the specific wiring of one
screen? → **Route.** Duplication *between* routes is acceptable; a shared abstraction
extracted upward into a route is not.

**Where does ambient state go?**
See §8.

---

## 7. Anti-patterns

**The fetching domain component.** A domain component calls its own domain's hook
"because it's right there". It is now unrenderable outside that data context and
invisible in the route's data story. *Fix: props, supplied by the route.*

**The service that fetches.** A service grows a call to the client "just for this
one thing". It is a domain now, but filed as a service, so nothing scopes its cache
or its invalidation. *Fix: call it a domain, or have the route feed it.*

**The upward import.** A domain imports a helper from a route, or the client imports
a type from a domain. One import, and the cycle exists. *Fix: move the shared thing
down, never reach up.*

**The generated type in a component.** A component's props mention a wire type. Now
every backend change is a UI change. *Fix: map at the client boundary.*

**The parallel style system.** Some shared UI is a component, some is a class in a
shared stylesheet, and there is no rule for which. The stylesheet becomes an
un-componentized second component library that nothing can typecheck. *Fix: pick
one; keep the stylesheet for tokens and primitives only.*

**The remounting provider.** A provider holds mutable identity, so the only safe way
to change that identity is `key={id}` — which destroys all state below it. *Fix:
§8.*

**Ambient-as-loophole.** Anything inconvenient to thread gets called "ambient" and
put behind an accessor hook, including things that fetch. The arrows quietly
reverse. *Fix: the rule in §8, written down.*

---

## 8. Ambient state

Some state is needed nearly everywhere — the session, the current tenant, the user
roster used for colours and labels, theme. Threading it through every level is
prop-drilling that no one will maintain.

The pattern is a **provider holding a stable instance**, not mutable state:

- The provider holds an **object or class instance created once** — a factory the
  provider calls lazily. Its identity never changes, so the provider never causes a
  cascade and never needs `key` to be re-targeted.
- The instance exposes **`subscribe` + a snapshot getter**, and the layer ships
  **accessor hooks** wrapping `useSyncExternalStore`.
- Consumers subscribe to **slices**, so a change re-renders only what selected it.
- It is **scoped, not global**. Reachable through its provider and its own hooks —
  not an importable singleton anything can call from anywhere.

The last point is what separates this from a global store. Global stores make every
call site invisible; a scoped instance keeps the graph legible.

**When the ambient data is server data, do not build a second store for it.** Read
it from the cache with a selector (§2, Domain). The stable-instance pattern is for
state that is genuinely *not* server-owned: session handles, ephemeral UI
coordination, engine instances.

**The rule that keeps this honest:**

> An ambient accessor may expose only state that is already loaded and
> synchronously derivable. **If reading it can trigger I/O, it is a domain, and the
> route must supply it.**

Without that sentence written down, "ambient" becomes the loophole that swallows the
pattern.

### Non-React access

A service instance is also the correct home for **non-React accessors** —
`getSession()`, `getTenantId()`. Anything running outside a component tree needs
them: a replayed offline write, an interceptor, a worker callback. Providing them
from a service is what stops those callers from importing React context or reaching
up into a route.

---

## 9. Composing with libraries

DRSp does not replace a data-fetching library, a router, or a state library. It says
where each one is allowed to appear.

**Query cache (TanStack Query or equivalent).** Lives in the Domain layer. Query and
mutation hooks are the domain's public surface; `queryFn`/`mutationFn` are Client
functions. Selectors use the cache's own `select` so consumers re-render on their
slice, not on the query. Query keys begin with the domain name and include the
tenant/account scope.

Two capabilities are worth knowing because they remove the usual reasons to
hand-roll a write queue: **mutation scopes** serialise writes sharing a scope id,
giving ordered dependent writes; and **paused-mutation dehydration** plus a cache
persister gives durable offline writes across restarts — provided invariants 7 and 8
hold.

**Router.** Owns Route composition, and provides Layouts natively through nested
routes and outlets. URL state belongs to the router; view state does not
(invariant 10). Guards belong to the router, backed by a session service.

**Client generation.** If the backend publishes a schema, generate the client and
treat regeneration as routine. If the SDK is a query builder rather than a generated
client, hand-write narrow functions per operation anyway — the value is that the
whole server surface is enumerable in one folder, not that a tool wrote it.

---

## 10. Testing

The layer shape predicts the test shape, which is the main practical dividend:

| Layer | Test |
|---|---|
| Client | Mappers, wire-shape edge cases. Pure. |
| Domain | Selectors and optimistic patch functions. Pure. |
| Domain components | Render with literal props. No providers. |
| Service | Feed input, assert output. Pure, or a store driven directly. |
| Layout | Render with slot placeholders. |
| Route | The thin part. Integration-test if at all. |

If a layer is hard to test, it is usually because it is doing another layer's job.
That is a more reliable structural smell than any lint rule.

---

## 11. Conventions

- **Folders are layers**, then domains inside `domains/`. Never `components/` or
  `utils/` at the top level — those are kinds, not layers.
- **A domain folder is self-contained**: queries, mutations, patches, selectors,
  types, and a `components/` subfolder.
- **Query keys**: `[domain, scope, …specifics]`.
- **No cross-domain imports of internals.** If two domains need the same thing, it
  belongs below both — usually in Assets, occasionally in a shared domain.
- **Barrels are optional and cheap to get wrong**; if used, one per layer or domain,
  never a global one.

### Enforcement

The invariants are import rules, so a tool should hold them rather than review
discipline.

**Verified for this repo:** Biome 1.9.4's `noRestrictedImports` accepts only a flat
map of exact module specifiers — no globs, and no scoping by importing file — so it
**cannot** express layer rules. Options, in rough order of cost:

- **`dependency-cruiser`** — purpose-built for exactly this: `forbidden` rules with
  `from`/`to` path patterns, toolchain-agnostic, runs in CI. The natural fit.
- **ESLint alongside Biome**, for `eslint-plugin-boundaries` or
  `import/no-restricted-paths` only.
- **A small custom check script** — cheap, no new toolchain, but one more thing to
  maintain.
- **A newer Biome**, if its restricted-import support has grown pattern matching by
  the time this is picked up.

Whatever the tool, the rules to encode are the ten in §4 — and the highest-value
three are: nothing above `client/` imports the SDK or generated types, `services/`
imports no domain, and `assets/` imports nothing.

---

## 12. What DRSp does not do

Stated plainly, so it isn't asked to:

- **It is not a state-management library.** It says where state lives, not how it
  works.
- **It does not decide domain boundaries.** Slicing the model is design work; the
  pattern only says each slice has exactly one owner.
- **It does not prevent a fat route.** Routes are allowed to be specific, and a route
  doing too much is still possible — it just becomes visible, because everything it
  orchestrates is named.
- **It is not free at small scale.** For an app with one screen, the layering is
  overhead. It pays off when there are enough screens that "where does this go?" has
  started costing time.
- **It does not survive unenforced.** Every violation is locally reasonable. Without
  a check in CI, the graph degrades at exactly the rate the team is busy.
