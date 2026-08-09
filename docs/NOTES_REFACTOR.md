# Notes Refactor — unify `checklist_item`, `note`, `list_item`

**Status: design in progress.** Nothing implemented. This records what a design
session settled on so the work can be picked up cold. It does not supersede
[`DATA_MODEL.md`](./DATA_MODEL.md) yet — when this lands it becomes Decision 13
and rewrites Decisions 5, 6 and 11.

---

## The idea

Three tables do "text and tickables" today, at three different grains:

| Table | Grain | Where `done` lives |
|---|---|---|
| `note` | series-owned, 1:N | n/a |
| `checklist_item` | series-owned, flat rows + `group_label` | `occurrence_item_state` — per occurrence |
| `list` + `list_item` | account-owned | `list_item.done` — on the row |

They collapse into **one `note` model**. A note is either *standalone*
(account-parented, today's List) or *owned by an event series*. Its content is an
ordered set of **rows**, each a heading, a checklist item, or a paragraph.

The app already wants this shape — `Attachment = note | checklist | reminder` in
`src/types.ts` is an ordered polymorphic list. The DB just doesn't have it.

---

## Bugs this fixes

Not speculative — all four are live today.

1. **Interleaved display order is lost on reload.** `rebuildAttachments`
   (`src/store/supabaseStore.ts:1236`) says so itself: attachments come back
   grouped (checklists, then notes, then reminders), not as authored.
2. **Two untitled checklists on one event merge into one.** A checklist has no
   row — its id is synthesised as `` `${seriesId}:checklist:${groupLabel}` ``
   (`:1259`), and untitled means `group_label = null`, so both bucket under `''`.
   The "+ Checklist" button creates untitled checklists.
3. **`sort_order = ci * 1000 + idx`** (`:1167`) silently breaks past 1000 rows.
4. **You cannot edit a checklist line's text for one occurrence.** Verified
   across all 21 migrations: there is a tombstone and a one-off-add, but no text
   override anywhere. Retyping a line retypes it for every occurrence.

---

## Shape

```sql
-- Content. One parent or the other, never both.
note (
  id, account_id?, owner_series_id?, title, author_id, metadata, created_at, updated_at
)

-- Content rows. NO `done` column — see Decision 2.
note_row (
  id, note_id, kind ('heading'|'check'|'para'), body,
  sort_key text collate "C",         -- fractional / LexoRank, see Decision 5
  required boolean,                  -- gates occurrence completion (checklists only)
  occurrence_start timestamptz       -- null = every occurrence; set = one-off add
)

-- All tick state, both grains, one table.
row_state (
  row_id, series_id?, occurrence_start?, status, completed_at
)   -- series/occurrence null = a standalone note's own state

-- Sparse per-occurrence divergence. Twin of occurrence_participant_override.
note_row_override (
  row_id, series_id, occurrence_start,
  body text,                         -- null = inherit
  sort_key text,                     -- null = inherit (per-occurrence reorder)
  removed boolean default false,     -- tombstone
  primary key (row_id, series_id, occurrence_start)
)
```

---

## Decisions

### 1. Ownership decides whether an edit propagates
- **Standalone note linked to an event** → one entity, editable from the List
  view and the event view, edits shared both ways. Never forks. (Today's
  `list_item_event_link` semantics, preserved.)
- **Series-owned note** → diverges per occurrence via overrides.

*Rejected:* a flag flipping a note between event-owned and standalone. Cheap in
schema, ambiguous in semantics — it changes which column is the source of truth
for every checklist row in the note, so N occurrences of tick history have to
collapse into one boolean with no defensible rule for which one wins.

*Also rejected:* auto-cloning a note on edit, in every variant discussed
(clone-to-standalone, clone-on-any-edit, per-occurrence fork). See Decision 3.

### 2. Tick state leaves the content row entirely
`note_row` has no `done`. All state — per-occurrence and standalone — lives in
`row_state`. Presence + status carries it, so unticking deletes the row and
`done = false` stops being stored anywhere (matching `occurrence_item_state`).

This is what keeps content and state cleanly separable: content writes and tick
writes touch different tables, always.

*Rejected:* keeping `list_item.done` as a `note_row.done` column for standalone
notes. It puts the two grains in different tables again for no gain.

### 3. Per-occurrence divergence = sparse overrides, never forks
`note_row_override` holds only diverged fields; the effective note for an
occurrence is base rows + one-off adds − tombstones + field overrides, merged on
read. Structurally identical to `occurrence_participant_override` (nullable field
= inherit, `removed` = tombstone), and to the CalDAV sparse-exception principle
at the top of `DATA_MODEL.md`.

*Rejected:* forking the note per occurrence (a full copy parented to
`(series, occurrence_start)`). Forking is what RFC 5545 and every calendar
product does — exception components are full replacements — and it buys a
one-branch read plus the deletion of the one-off-add convention. But a forked
occurrence stops hearing from the series: a row added later is **silently
absent**. Calendars get away with that because their divergent fields are scalars
where staleness is visible; a note is a collection, where it isn't.

**Two accepted costs:**
- Overrides inherit deletions as well as additions. Delete a base row and an
  occurrence that had customised it loses the line. Same as
  `occurrence_participant_override` already behaves.
- The read-side merge stays (forking would have collapsed it). It already exists
  in `rebuildAttachments`; this adds one dimension to it.

### 4. `occurrence_item_removed` is deleted
Folded into `note_row_override.removed`. One-off adds keep using
`note_row.occurrence_start`, as `checklist_item` does today.

### 5. `sort_key` is fractional (LexoRank-style text), not a dense int
Adopted in v1 on its own merits: it removes the full renumber on every save
(`syncChecklist` currently rewrites every row's `sort_order`) and the 1000-row
ceiling. `text collate "C"` so comparison is bytewise; always sort
`(sort_key, id)` so keys generated concurrently by two offline devices tie
deterministically.

It also makes per-occurrence reorder a single nullable column on
`note_row_override` rather than a new table — a moved row's position becomes one
value computed between its neighbours, instead of a property spread across N rows.

*Rejected:* an order-as-array table (`row_order uuid[]` per note per occurrence).
Exact rather than approximate, but Postgres can't FK array elements, concurrent
adds collide at whole-array granularity, and it costs a table. Revisit only if
approximate ordering proves insufficient. If ever adopted, the read rule must be
*order is advisory, never gates visibility* — render array order, then append
unlisted rows — so a stale array degrades to bad order, never hidden data.

### 6. Single-occurrence events never write overrides
Guard on `rrule is null`: edit the base row in place. Over 50% of this account's
events are one-offs, where a series *is* its occurrence and an override row would
shadow a base nothing else reads.

### 7. Scope is asked with the existing `ScopeSheet`
No new UI. Edit from `OccurrenceSheet` → override this occurrence. "All events"
from `EventEditor` → edit the base rows. "This and following" → `split_series`,
which already copies notes.

---

## Open questions

1. **The load story — the main engineering cost.** `DayView`'s progress badge
   reads `checklistEntries(event)` (`DayView.tsx:309`) and `isOccurrenceDone`
   reads series-level entries (`occurrences.ts:16`). Both assume the row set is
   identical for every occurrence. With overrides it varies by date, so the
   effective note has to reach the per-month completions window
   (`src/data/completions.ts`) rather than riding along with the event. Sparse
   overrides fit that window well — they're the same shape as
   `occurrence_item_state`, already fetched there. Not yet designed.
2. **`due_on` / `person_id`** (see the separate investigation): drop them, or
   promote them to `note_row` so every checklist row can carry an assignee and a
   deadline? Today `person_id` is list-local and its search plumbing is dead;
   `dueOn`'s only cross-feature use is the linked-to-do line in `OccurrenceSheet`.
3. **RLS becomes a union.** A dual-parent `note` needs
   `owner_series_id is null and is_account_member(account_id) or can_access_series(owner_series_id)`
   plus a check constraint that exactly one parent is set. `DATA_MODEL` Decision 1
   deliberately avoided union policies; this one needs a test.
4. **A diverged occurrence needs a visible marker**, or Decision 3's inherited
   deletions become invisible.
5. **Offline queue.** `planner.pendingWrites.v1.<accountId>` holds raw `Action`
   objects across restarts. Bump the version and decide translate vs. discard.
6. **`split_series`** gains override rows as one more retarget step (same pattern
   as 4c/4d), and notes now have children that ticks point at, so they need the
   `_item_map` fresh-id treatment `checklist_item` already gets.

---

## Staging

Each stage ships independently.

1. **Event content** — `checklist_item` + `note` → `note` / `note_row` /
   `row_state`, series-parented, with `sort_key`. Fixes bugs 1–3. Self-contained
   in the series grain; `split_series` changes once.
2. **Lists** — `list` / `list_item` onto the same tables with `account_id` as the
   alternate parent; convert `list_item_event_link`. List titles become note
   titles, `group_label` values become heading rows.
3. **Per-occurrence overrides** — `note_row_override`, delete
   `occurrence_item_removed`. Fixes bug 4. Needs open question 1 answered first.

**Migration hazard:** preserve uuids. `occurrence_item_state.item_id` and
`occurrence_item_removed.item_id` FK `checklist_item(id)`; migrating rows under
their existing ids means every tick ever made survives for free.

**Blast radius:** essentially every data-touching file —
`supabaseStore.ts` (the mapping is concentrated there), `reducer.ts`,
`actions.ts`, `store.ts`, `data/completions.ts`, `data/templates.ts`,
`lib/attachments.ts`, `lib/lists.ts`, `lib/occurrences.ts`, `lib/search.ts`,
both search RPCs, `AttachmentsEditor.tsx`, `Lists.tsx`, `OccurrenceSheet.tsx`,
`EventEditor.tsx`, `TemplateEditor.tsx`, `ListSearch.tsx`, `DayView.tsx`,
`Settings.tsx`, and the four test files covering them.
