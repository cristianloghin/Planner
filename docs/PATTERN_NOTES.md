# Working notes on DRSp

Findings from converting `/day` to a real route (`c6050ac`) and from the
conversation that followed. Not a plan and not settled doctrine — the evidence
and the open questions, written down while they are cheap to recover.

Each finding says what was measured, so none of it has to be taken on trust.

---

## 1. Layouts own interaction, not just presentation

**The doc is wrong about this, and it matters.** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
§2 calls layouts "presentational only". The evidence says a layout is the right
home for an *interaction model* too.

Measured: **four components hand-roll the same three-page swipe deck.**

| | own refs | own `useSwipeGestures` | same `swipeClip` → `swipeStrip` → `pageInert(i === 1)` |
|---|---|---|---|
| `DayView` | ✓ | ✓ | ✓ |
| `WeekCalendar` | ✓ | ✓ | ✓ |
| `WeekTimeline` | ✓ | ✓ | ✓ |
| `MonthView` | ✓ | ✓ | ✓ |

The deck's *CSS* was already extracted to `shared.module.css` (`.swipeClip`,
`.swipeStrip`). Its *structure and wiring* were copied four times.

So the shape is a layout with `previous` / `current` / `next` slots that owns
`scrollRef`, `stripRef` and the gesture service. The route feeds data into
components and drops those components into the slots. The same deck then serves
Day, Week and Month, because it never knows what is in a slot.

**Why refs belong in the layout, not passed in as props.** The tempting move is
to keep layouts "pure" by having the route own the refs and hand them down. That
is wrong, and the invariant already allows the better answer: §2 says a layout
"does not receive domain objects, and does not call hooks that produce data."
`useSwipeGestures` produces *interaction*, not data. Behaviour was never
excluded — the rule is about data. If the route owned the wiring instead, every
route using the deck would repeat it, which is the duplication above with extra
steps.

**Nesting falls out of the same evidence.** The outer deck is identical for all
four screens. What differs is only the slot contents:

| screen | what fills a slot |
|---|---|
| Day | a lanes grid, one column per person |
| Week | a seven-day grid |
| Month | a month grid |

Same outer layout, a different inner one. That is nesting argued by the code
rather than by taste.

**Two things this retires.** `DayView` currently reads `pages[1]` to mean "the
visible day", with nothing enforcing that there are three pages — named slots
make it structural. And `pageInert(pageIdx === 1)` stops being the same magic
number in four files.

**Open question.** Zoom is per-deck, not per-app: Day and Week share `hourH`
through the same `loadZoom('planner:hourH')` key, and Month has no zoom at all.
So a deck's zoom is optional, and two decks are coupled through localStorage
rather than through the layout. Probably fine — but worth deciding rather than
inheriting.

---

## 2. Colour is a domain with no name

This is the thing that made "which domain does `DayView` belong to?" unanswerable.

Measured — two components carry two whole arrays to resolve one colour:

```
AllDayChip   occ, personId, onClick, people, overrides
Lane         person, blocks, nowMin, pxPerMin, onAddAt, onOpen, people, overrides
```

And the resolver spans two domains:

```ts
// domains/people/selectors.ts
personColorKey(people: Person[], overrides: Record<PersonId, ColorKey>, id)
//             ^ people domain      ^ preferences domain
```

It lives in `people` because it had nowhere else to go, and now drags both
domains' data through the whole render tree.

**A correction worth recording**, because it changed the conclusion: it was
claimed during this work that resolving colour upstream would need "a colour per
lane and per block". That is wrong. Reading `eventColorKey`, a block's colour is
just `event.colorKey ?? theLaneColour` — so **one resolved colour per lane is
enough**, and the per-block part only needs `colorKey()`, already an asset. The
argument for tolerating the domain import rested on a misreading.

A `colors` domain owning the palette binding, the per-user overrides and the
resolution rules would let `Lane` take `person, blocks, color` and be
unambiguously one domain's component. Without that, slot contents straddle two
domains and the layout model does not pay off.

**Do this before re-asking whether a view is an asset or a layout.** The
taxonomy question looks different once a view is not dragging two domains
through it, and there is a real risk of inventing a primitive to solve what was
really a misplaced concern.

---

## 3. Domains are concepts, not tables

The instinct that a domain need not be 1:1 with a backend model is already
borne out here:

- `domains/occurrences` is not the `event_occurrence` table — it is *what
  happened on a day*, keyed `eventId:date`, a shape the database does not have.
- `domains/search` has no table at all; it wraps an RPC.
- `domains/auth` is mutations only.

**The least 1:1 domains are the healthiest ones.** The friction is in the 1:1
ones — `people` ended up owning colour precisely because colour had no concept
of its own. On this evidence 1:1 is the anti-pattern, not the default.

---

## 4. The invariant that needs sharpening

§2's "domain components are dumb" overshoots what is actually meant. Invariant 2
already has it right — "domain components never call domain data *functions*".
The rule worth enforcing is about I/O and hooks, not module boundaries:

> A view may import a domain's **pure selectors**. It may not import its
> **queries or mutations**.

That is lint-enforceable (an import-boundary rule on `use*` from `domains/`) and
it says what is meant. As written, the stricter reading has no answer for "a pure
derivation over domain data, needed at render time" — see §2 above.

---

## 5. Unanswered: may a route hold view state?

`DayRoute` holds the editor and occurrence-sheet state, on the reasoning that
*how a thing is reached* is the shell's business — so when those become query
state or routes, `DayView` does not notice. That felt right and it is the part of
the split that paid immediately.

But the pattern does not say whether routes may hold UI state, and the answer
decides whether routes stay thin. Worth settling explicitly.

---

## 6. What the router would need

Nesting already works and needs no change: parents are inferred from **path
prefixes** (`isStrictSegmentPrefix`), `parent: null` is an opt-out, and the
parent's component receives the matched child as `outlet`. So
`/calendar` + `/calendar/day` nests today on 0.9.0. (Reading only the type,
`parent?: null`, suggests otherwise — the runtime is what to check.)

What is missing is a **typed per-route value** so a parent can compute once and
children can read it. `meta` is app-global, not per-subtree, so it does not
cover this. Three constraints worth holding:

- **Passing, not loading.** TanStack Query already owns fetching; two owners is
  worse than either. The router should say *where a value lives*, not how it is
  fetched.
- **Typed by path**, like params already are.
- **Reading it must not trigger I/O** — the same sentence that keeps §8 honest,
  or route context becomes the new loophole.

Evidence for the need: `DayView`, `WeekCalendar` and `MonthView` call the *same
five hooks* — `useAccount`, `useEvents`, `usePeople`, `usePreferences`,
`useCompletionsForRange`. A `/calendar` parent should compute those once.

Treat `provide` / `useRouteValue` as a hypothesis to test on `/calendar` before
committing it to the router's API. It is one route's worth of evidence.

---

## 7. On the name, and on "MVC on React steroids"

The acronym names three of six primitives — Client, Layout and Assets are all in
§2 but not in the name. So promoting Layout raises a prior question: is the name
meant to list the primitives, or the load-bearing ones? If the former it should
be all six; if the latter, Layout has earned its place on the evidence in §1.

The MVC analogy holds better than most: Domain ≈ Model, Layout + components ≈
View, Route ≈ Controller. Worth naming where it misleads, though — in MVC the
controller mediates **bidirectionally** between model and view. Here the route
composes in one direction only, and writes go back through domain mutations,
never through the route. Someone reading "controller" may build a fat one.

The genuinely un-MVC parts are the ones doing the most work: the query cache as
the source of truth rather than a model object, and optimistic updates as pure
exported functions (invariants 7 and 8). Both of those survived a strip-down
that removed roughly 6,000 lines, which is the strongest evidence in this file
that the pattern is load-bearing.
