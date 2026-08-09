# The Note Model

A looser, more flexible way to attach information to an occurrence.

A **note** is a small ordered document. It can stand on its own, or belong to an
event series, or be surfaced on a specific occurrence. Its content is a sequence
of **rows** — a heading, a checklist item, or a paragraph — so one note can be a
shopping list, a set of instructions, a scribble, or all three at once.

**Status: design only.** These tables are a *parallel* structure. They stand
alongside whatever else exists and take nothing over. This document specifies
storage and the rules that govern it; how any of it is read or rendered is out of
scope.

---

## Tables

```sql
-- A note. `account_id` is always set (tenancy); `owner_series_id` is the owner,
-- null for a standalone note.
create table note (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references account(id) on delete cascade,
  owner_series_id uuid references event_series(id) on delete cascade,
  title           text not null default '',
  author_id       uuid not null references app_user(id),  -- set at creation, never reassigned
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One line of a note. Content only — no tick state (Decision 3).
create table note_row (
  id               uuid primary key default gen_random_uuid(),
  note_id          uuid not null references note(id) on delete cascade,
  kind             text not null,          -- 'heading' | 'check' | 'para'
  body             text not null default '',
  sort_key         text not null collate "C",   -- fractional key (Decision 6)
  occurrence_start timestamptz             -- null = every occurrence; set = one-off add
);

-- Tick state, for both grains.
--   series_id + occurrence_start set  -> state for that one occurrence
--   both null                         -> the row's own state (standalone note)
-- Presence carries it: unticking deletes the row.
create table row_state (
  row_id           uuid not null references note_row(id) on delete cascade,
  series_id        uuid,
  occurrence_start timestamptz,
  status           text not null,          -- 'done' | 'skipped' | 'blocked'
  completed_at     timestamptz not null default now()
);

-- Sparse per-occurrence divergence. A row here exists only where an occurrence
-- differs from the note's base rows; null field = inherit.
create table note_row_override (
  row_id           uuid not null references note_row(id) on delete cascade,
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  body             text,
  sort_key         text,
  removed          boolean not null default false,
  primary key (row_id, series_id, occurrence_start)
);

-- Surfaces a standalone note on a concrete occurrence. M:N — the same note can
-- hang off several occurrences.
create table note_occurrence_link (
  note_id          uuid not null references note(id) on delete cascade,
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  created_at       timestamptz not null default now(),
  primary key (note_id, series_id, occurrence_start)
);
```

---

## Decisions

### 1. Tenancy and ownership are separate columns
`account_id` is always populated; `owner_series_id` is null for a standalone
note. So access control is a single rule — account membership — and ownership is
just a nullable pointer.

*Rejected:* mutually exclusive parents (`account_id` **or** `owner_series_id`,
with a check constraint). It forces every access policy into a union of two
rules for no gain, since a series belongs to an account anyway.

`author_id` is a third, separate thing: the user who wrote the note. It is not
access control — everyone in the account sees every note regardless — it is a
filter, so a standalone note can be sorted into mine and theirs. Because it is
read as a filter it is `not null`, and it is stamped once at creation: editing
someone else's note must never reassign it, or one person's view slowly absorbs
the other's notes.

### 2. `occurrence_start` is the original slot, and is never an FK
Every table keyed to an occurrence uses the instant the recurrence rule
*originally* produced, even if that occurrence is later moved. Most occurrences
are virtual — never materialised as a row — so there is nothing to point a
foreign key at. Its integrity is the application's job.

### 3. Tick state lives outside the content row
`note_row` has no `done` column. All of it — per-occurrence and standalone —
lives in `row_state`, distinguished only by whether the occurrence key is
populated. Presence plus status carries the state, so unticking deletes the row
and `false` is never stored.

This keeps a clean seam: content writes and tick writes always touch different
tables.

*Rejected:* a boolean on the row for standalone notes, with the state table used
only for series-owned ones. Same information in two places, and which one is
authoritative would depend on the note's owner.

### 4. Per-occurrence divergence is sparse overrides, not copies
An occurrence that differs from its note's base rows stores only the difference:
a `body` to replace the text, `removed` to hide the row, or a `note_row` with
`occurrence_start` set to add one. The effective content for an occurrence is
base rows + one-off adds − tombstones + field overrides.

This is the CalDAV / RFC-5545 exception model: a clean series stores nothing at
all, and rows appear only where reality diverges from the rule.

*Rejected:* copying the whole note per occurrence on first edit. The read gets
simpler — one branch, no merge — but a copy stops tracking its source, so a row
added to the note later is **silently absent** from every occurrence that was
ever customised. Calendars get away with copy-on-write because their divergent
fields are scalars, where staleness is visible as a wrong value; a note is a
collection, where it is an invisible gap.

**Accepted consequence:** inheritance runs both ways. Delete a base row and an
occurrence that had customised it loses the line along with it.

### 5. Ownership decides whether an edit propagates
- A note **linked** to an occurrence is one entity. Editing it changes the note
  everywhere it appears. It never diverges, never copies.
- A note **owned** by a series diverges per occurrence, via Decision 4.

One rule: a borrowed note is never modified on your behalf; your own note can
differ from day to day.

*Rejected:* a flag that converts a note between owned and standalone. It reads
like a one-column change but it moves the source of truth for every checklist row
in the note — many occurrences of tick history would have to collapse into one
value, with no defensible rule for which occurrence wins.

*Also rejected:* copying a note on edit, in every variant — copy-to-standalone,
copy-on-any-edit, copy-per-occurrence. Either the copy fires invisibly on a
keystroke, or it needs a trigger that has to distinguish an "edit" from a tick,
and it always severs the note from the thing it was copied from.

### 6. `sort_key` is a fractional key, not a dense integer
Order is a lexicographically-sorted text key (LexoRank / fractional-indexing
style), so a value can always be generated *between* any two existing ones.
Inserting or moving a row writes that one row, never its neighbours, and there is
no ceiling on how many rows a note can hold.

`collate "C"` so comparison is bytewise rather than locale-dependent. Sort by
`(sort_key, id)` — two clients generating a key for the same gap while offline
can produce the same value, and the tie must break identically on both.

It also makes per-occurrence reordering a single nullable column
(`note_row_override.sort_key`) instead of a structure of its own: a moved row's
position is one value computed between its neighbours, rather than a property
spread across every row in the note.

*Rejected:* holding order as an array of row ids per note (and per occurrence).
It gives exact order rather than approximate, but no foreign key can protect an
array element, two concurrent additions collide over the whole array instead of
merging, and it costs another table. Worth revisiting only if approximate
ordering proves insufficient — and if it is ever adopted, the read rule must be
*order is advisory, never gates visibility*: render array order, then append any
row the array omits, so a stale array degrades to bad order and never to hidden
content.

### 7. A non-repeating series writes no override rows
Where a series produces exactly one occurrence there is nothing to diverge from,
so edits go to the base row. Override rows are only ever written for genuinely
recurring series.

---

## Notes on the keys

`row_state` has a nullable occurrence key, so its uniqueness needs
`unique nulls not distinct` (PG 15+) or a unique index over coalesced columns —
a plain composite primary key will not enforce it.

`note_row_override` has no such problem: an override only exists in a
series-and-occurrence context, so all three key columns are non-null.

---

## Build order

1. `note`, `note_row`, `row_state` — a note that stands alone or belongs to a
   series, with rows and ticks.
2. `note_occurrence_link` — surfacing a standalone note on an occurrence.
3. `note_row_override` — per-occurrence divergence.

Each stage is usable without the ones after it.
