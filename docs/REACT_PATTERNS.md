# Planner — React Patterns

How the frontend is built and the conventions an edit should follow. The data
model itself (tables, grains, RLS) is [`DATA_MODEL.md`](DATA_MODEL.md); this
document is about the React layer on top of it. Everything here describes code
that exists — file links point at the canonical example of each pattern.

Commands:

```
npm run dev        # Vite dev server
npm run lint       # Biome: format check + lint + import order
npm run lint:fix   # ...and write the fixes
npm run typecheck  # tsc, strict
npm test           # Vitest
```

---

## 1. The one rule: every slice of data has exactly one owner

The app is mid-migration (strangler-fig) from a single reducer to TanStack
Query, and the only thing that keeps that sane is that **each slice of data has
one owner and everything reads it from there**:

| Slice | Owner | Why it lives there |
|---|---|---|
| People, events, lists, dependencies, to-do links, preferences | Reducer ([`src/store/reducer.ts`](../src/store/reducer.ts)) + [`AppProvider`](../src/state.tsx), persisted via [`ScheduleStore`](../src/store/store.ts) | Small, loaded whole at startup, changed by explicit user actions |
| Event templates | TanStack Query ([`src/data/templates.ts`](../src/data/templates.ts)) | First slice migrated; simple list, ideal pilot |
| Per-occurrence state (statuses, checklist ticks, timing overrides) | TanStack Query ([`src/data/completions.ts`](../src/data/completions.ts)) | Grows with every tick ever made, so it is fetched per **month window**, never whole |
| Navigation (selected week/day, active tab), form drafts, open dialogs | Local `useState` in the component | Nobody else needs it |

When adding data, decide the owner first:

- **Changed by a user action, bounded in size** → extend `AppState` and the
  reducer slice (§2).
- **Grows unboundedly or wants windowed/targeted fetching** → a new Query slice
  (§3).
- **Only one component cares** → `useState`, and resist promoting it.

Reading state: components call `useApp()` for the reducer slice and the
`use*` hooks from `src/data/` for Query slices. Nothing else touches
`SupabaseStore` directly from the UI.

## 2. The reducer slice: how a write flows

One path, no exceptions ([`src/state.tsx`](../src/state.tsx)):

```
dispatch(action)
  → reducer(prev, action)      // pure, optimistic — UI updates instantly
  → snapshot to localStorage   // instant/offline startup paints this
  → append to the write queue  // persisted per account
  → pump: ScheduleStore.apply(action, state)  // one at a time, in order
  → realtime echo → (debounced) reload → authoritative state replaces optimistic
```

The queue is why offline works: a network failure leaves the action at the
head to retry; a server rejection drops it and reloads. Dependent writes
(create a list, then add its items) can never reach the server out of order
because the pump is strictly sequential.

**To add an action:**

1. Add the variant to [`src/store/actions.ts`](../src/store/actions.ts) with a
   comment saying what it means (not what fields it has).
2. Handle it in [`src/store/reducer.ts`](../src/store/reducer.ts) — pure,
   immutable updates only, and mirror any DB cascade in memory (see
   `removeEvent` for the fullest example). Add a case to
   [`reducer.test.ts`](../src/store/reducer.test.ts) if the behaviour is more
   than a field assignment.
3. Persist it in `SupabaseStore.apply`
   ([`src/store/supabaseStore.ts`](../src/store/supabaseStore.ts)).
4. If it is pure UI navigation, skip step 3 and add it to `UI_ACTIONS` in
   [`src/store/offline.ts`](../src/store/offline.ts) so it is never queued.
   (`goToDate` is the model: the week + day pair set in one dispatch.)

**Caller-minted ids.** Create actions accept an optional `id` so the caller can
mint it up front (`uid()`) and keep dispatching against it — never "the last
row appended", which a realtime reload can invalidate mid-flight. See the
draft-save flow in [`Lists.tsx`](../src/components/Lists.tsx).

## 3. Query slices: windowed data and durable mutations

[`completions.ts`](../src/data/completions.ts) is the reference implementation;
read its header comment before extending it. The essentials:

- **Keys are account-scoped**: `['completions', accountId, 'yyyy-mm']`. One
  query per calendar month, fetched with margins so windows overlap; views call
  `useCompletionsForRange(from, to, extraDates)` and get a merged map.
- **Mutations are registered as mutation *defaults*** on the query client, keyed
  by name, with fully serializable variables. That is what makes offline writes
  durable: a paused mutation is persisted, rehydrated on the next launch, and
  resumed by looking its `mutationFn` up by key. If your variables capture a
  closure or a class instance, resume breaks.
- **Optimistic patch + rollback + settle-invalidate** is the standard shape —
  `useTemplateMutation` in [`templates.ts`](../src/data/templates.ts) is the
  small, readable version.
- **Realtime routing**: `onRemoteChange` in [`state.tsx`](../src/state.tsx) maps
  a changed table to either a targeted cache invalidation (Query-owned tables)
  or the full-state reload (reducer-owned tables). A new Query slice must add
  its tables to that routing, or a partner's change will trigger a needless
  full reload — and its own cache will go stale.
- The store is obtained via
  [`useAccountStore()`](../src/data/useAccountStore.ts) inside hooks, or
  `resolveWriteStore()` (completions.ts) outside them.

## 4. Realtime vs. open forms: the edit guard

A partner's change triggers a state reload, and a reload would clobber
controlled inputs holding an unsaved draft. Two tools handle this; every
editing surface uses one:

- **`beginEdit`/`endEdit`** (from `useApp()`): bracket the whole time an editor
  is open. Reloads are deferred and flushed when the last edit ends. The idiom
  is a single effect keyed on "am I editing":

  ```tsx
  useEffect(() => {
    if (!isEditing) return
    beginEdit()
    return endEdit
  }, [isEditing, beginEdit, endEdit])
  ```

  See [`EventEditor.tsx`](../src/components/EventEditor.tsx) (always editing
  while mounted) and [`Lists.tsx`](../src/components/Lists.tsx) (edit mode
  toggles).

- **[`CommitTextInput`](../src/components/CommitTextInput.tsx)**: for
  write-through text fields. Keystrokes stay local; the value commits on a
  debounce + blur, and external updates are only adopted while the field is
  not focused. Use it whenever an `<input>`'s value comes straight from the
  store — a plain controlled input there means one network write per keystroke
  and a reload can eat what's being typed.

**Draft vs. write-through** is a deliberate distinction (see the `Lists`
component doc comment): a *new* thing is composed as a local draft object and
persisted only on Save; editing an *existing* thing writes through on every
change. Follow whichever the surface already does.

## 5. Component conventions

### File shape

One exported component per file in `src/components/`, with its styles in a
sibling `*.module.css`. Small private subcomponents live below the export in
the same file until someone else needs them (that is how `Avatars` earned
promotion). Pure logic goes in `src/lib/` — if a function doesn't need React,
it doesn't live in a component file, and it gets a `*.test.ts` next to it.

### Views and editors

- A tab view is `<section className={shared.view}>` with
  [`ViewHeader`](../src/components/ViewHeader.tsx) (search / nav / today) and a
  `shared.viewBody`. Day, Week and Month are the models.
- A full-page surface (event editor, occurrence sheet) is
  `shared.editorPage` + `shared.editorHead` (Cancel / title / primary action)
  + `shared.editorBody`.
- Confirmations use [`ConfirmDialog`](../src/components/ConfirmDialog.tsx)
  (Radix AlertDialog) — never `window.confirm`. Other modal pickers use Radix
  `Dialog` directly (the group picker in `Lists.tsx` is the example).
- Loading: `PageLoader` when nothing usable is on screen; `LoadingPill` when a
  background fetch is refining an already-usable view
  ([`Spinner.tsx`](../src/components/Spinner.tsx) explains the split). A
  paused-offline fetch is *not* loading — don't wedge a loader on it.

### Styling and color

- CSS Modules + design tokens ([`src/styles/tokens.css`](../src/styles/tokens.css)).
  No inline style objects for static styling — inline styles are only for
  values computed at runtime (positions, heights).
- Class names combine with [`cx()`](../src/lib/cx.ts).
- **Color flows through one channel**: an element gets
  `style={colorStyle(key)}` (which sets the `--c` custom property) and the
  stylesheet derives fills/tints/borders from `var(--c)`. Palette keys come
  from [`src/lib/palette.ts`](../src/lib/palette.ts) via `personColorKey` /
  `eventColorKey` ([`src/lib/people.ts`](../src/lib/people.ts)). Never put a
  literal color in TSX; the values live in
  [`swatches.css`](../src/styles/swatches.css).

### Forms and buttons

- Every `<button>` declares its `type`. Untyped buttons default to `submit`
  and will submit an enclosing form — and the event editor wraps its whole
  page in one. Biome enforces this (`useButtonType`).
- Icon-only buttons carry an `aria-label`.
- Forms submit via `onSubmit` on the `<form>` (so Enter works), with exactly
  one explicit `type="submit"` button. A form rendered through a portal from
  inside another form must `stopPropagation()` its submit (see the group
  picker in `Lists.tsx` for why).

## 6. Hook idioms

- **`useLatest(value)`** ([`src/lib/useLatest.ts`](../src/lib/useLatest.ts)):
  a ref that always holds the current value. Use it when a callback binds once
  (native listeners, timers) but must read fresh state when it fires — instead
  of re-subscribing on every change or hand-rolling `ref.current = value`.
  Examples: the pinch/swipe listeners in `DayView`, the retry timer in
  `state.tsx`, `useSearch`.
- **String-keyed memos**: when a dependency is an array that gets a fresh
  identity with unchanged contents, key the hook on `arr.join(',')` and
  suppress the dependency rule *with a reason*:

  ```ts
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the joined dates so ...
  ```

  Every `biome-ignore` in the codebase carries an explanation; a bare one
  should not pass review. Prefer fixing the dependency over suppressing —
  suppress only when the deviation is the point (mount-only effects,
  bind-once listeners reading through refs).
- **Race guards in async effects**: an effect that awaits sets a `cancelled`
  flag in cleanup and checks it before `setState`
  ([`useSearch`](../src/lib/useSearch.ts)); concurrent resolvers that must not
  commit stale results use a monotonic sequence number
  ([`auth.tsx`](../src/auth.tsx)) or an epoch counter (`writeEpochRef` in
  `state.tsx`). When you add an await between a read and a write, ask what
  happens if the world changed in between — this codebase always answers it.
- **Derived, don't stored**: things computable from existing state (`isToday`,
  `open`/`done` partitions, group maps) are computed in render, memoized with
  `useMemo` only when actually expensive (recurrence expansion over a grid is
  the benchmark; a `filter` over a household's list is not).

## 7. Dates, times, ids

- Dates are local ISO strings: `'yyyy-mm-dd'` for days,
  `'yyyy-mm-ddThh:mm'` for timed starts. All arithmetic goes through
  [`src/lib/dates.ts`](../src/lib/dates.ts) (`addDays`, `mondayOf`,
  `diffDays`, ...). **Never subtract epoch milliseconds to get a duration
  across days** — DST shifts it by an hour; see `minutesBetween` in
  `EventEditor.tsx` for the wall-clock way.
- An occurrence is identified by `occKey(eventId, date)` → `'id:yyyy-mm-dd'`
  ([`src/lib/occurrences.ts`](../src/lib/occurrences.ts)). The date is the
  occurrence's *original* slot — a rescheduled occurrence keeps its identity.
- Ids are minted client-side with [`uid()`](../src/lib/id.ts) (UUID v4), so
  optimistic rows are real rows.

## 8. Testing

- Pure logic gets a Vitest file next to it (`src/lib/*.test.ts`,
  `src/store/reducer.test.ts`). That is where the value is: recurrence math,
  offline queue serialization, reducer cascades.
- Test files build state with small local factory helpers (`item()`,
  `event()`, `baseState()` — see
  [`reducer.test.ts`](../src/store/reducer.test.ts)) rather than fixtures.
- There is no component/DOM test setup yet. If a behaviour is worth a test but
  lives in a component, first ask whether it can move to `src/lib/` as a pure
  function — that has been the pattern so far.

## 9. Tooling

Biome ([`biome.jsonc`](../biome.jsonc)) is the single formatter/linter:
single quotes, no semicolons, 100-column lines, sorted imports. A handful of
rules are deliberately off, each with its reason inline in the config — read
it before flagging or re-enabling one. CI-equivalent check locally:

```
npm run lint && npm run typecheck && npm test
```

If a rule and this document ever disagree, the config wins for style and this
document wins for architecture — and either way, fix the disagreement.
