# The Note Model

A looser, more flexible way to attach information to an occurrence.

A **note** is a small ordered document. It can stand on its own, or belong to an
event series. Its content is a sequence of **rows** — a heading, a checklist
item, or a paragraph — so one note can be a shopping list, a set of
instructions, a scribble, or all three at once.

> These notes are a new structure and have nothing to do with the older
> per-event text blocks described elsewhere. Same word, different thing.

**Status: design only.** These tables are a *parallel* structure. They stand
alongside whatever else exists and take nothing over. This document specifies
storage and the rules that govern it; how any of it is rendered is out of scope.
The one exception is [the editor contract](#the-editor-contract), which is a
storage concern: the Notes library's document model constrains what these
columns are allowed to hold.

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
  body            jsonb not null default '{"rows":{}}',
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A series has at most one note. Standalone notes are null and unconstrained.
create unique index note_one_per_series
  on note (owner_series_id) where owner_series_id is not null;

-- Sparse per-occurrence divergence: one JSON merge patch per occurrence.
-- No series_id — the note already knows its series.
create table note_occurrence_override (
  note_id          uuid not null references note(id) on delete cascade,
  occurrence_start timestamptz not null,
  patch            jsonb not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (note_id, occurrence_start)
);
```

---

## The document

`body` holds the whole note. Rows are an object keyed by row id — never an
array — so every write is addressable by path and no row's position depends on
another's.

```json
{
  "rows": {
    "5c1f…": { "type": "heading", "text": "Hardware", "sort": "a1" },
    "9a02…": { "type": "check",   "text": "screws",   "sort": "a2" },
    "b73d…": { "type": "para",    "text": "from the blue bin", "sort": "a3" }
  },
  "attrs": {
    "done":    { "9a02…": true },
    "flag":    { "b73d…": "blocked" },
    "deleted": { "1e88…": true }
  }
}
```

A row is never removed from `rows`. Deleting marks it in `attrs.deleted` and
the read skips it (Decision 6).

`patch` holds a **JSON merge patch** (RFC 7386 semantics) over that document.
Present keys merge, `null` deletes, and anything unmentioned inherits:

```json
{
  "rows": { "9a02…": { "text": "brass screws" } },
  "attrs": { "done": { "9a02…": true }, "deleted": { "b73d…": true } }
}
```

`null` clears one attr entry (`attrs.done.<id>: null`) or a whole namespace
(`attrs.done: null`). Deleting a row is normally a tombstone rather than
`rows.<id>: null` — see Decision 6, including the one case where the physical
removal is the right call.

### Reads

- **Standalone note** — `body`, as it stands.
- **Series note, whole series** — `body`, as it stands.
- **Series note, one occurrence** — `merge(body, patch)` for that occurrence;
  `body` alone where no override row exists.

A clean series stores nothing per occurrence. Rows appear in
`note_occurrence_override` only where reality diverges from the note.

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

### 3. The note is one JSON document, not a table of rows
Rows, their order and their tick state all live in `body`. A note is read whole,
written whole-ish, and never joined.

The structure a row-per-table model buys — per-row foreign keys, SQL-side
aggregation, row-grain history — buys nothing here, because a note is always
read as a unit and its rows reference nothing. What it costs is a table, a
second table for tick state, a third for divergence, and a hand-rolled patch
format spread across nullable columns.

*Rejected:* `note_row` + `row_state` + `note_row_override`. Every one of those
tables turned out to be a JSON merge patch wearing a schema: nullable
field-means-inherit is patch absence, a `removed` boolean is a `null` tombstone,
and presence-carries-tick is a sparse map. Expressing them as JSON is the same
model with three fewer tables and a merge that is already implemented.

**Accepted consequences:** no foreign key can reach inside a row, so note rows
stay pure content — a per-row assignee would have to be a bare id with no
cascade. Aggregate queries ("how many items are unticked across the account")
move from SQL to the application or to a GIN index. And Postgres rewrites the
whole `body` on every commit, which makes edit debouncing mandatory rather than
polite.

### 4. A series has exactly one note
Enforced by a partial unique index, not by convention. One note per series keeps
"the note for this event" a single unambiguous thing to open, edit and diverge.

*Rejected:* many notes per series. It needs an ordering between notes, a rule
for which one an occurrence's overrides belong to, and a UI that lists notes
before showing one. None of that earns its place at household scale.

### 5. Per-occurrence divergence is a merge patch, not a copy
An occurrence that differs from its note stores only the difference. The
effective content is `merge(body, patch)`.

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

### 6. Deletion is a tombstone, never a removal
A deleted row keeps its entry in `rows` and is marked in `attrs.deleted`. The
read filters it out; the document does not forget it.

This is what makes a patch safe to apply late. A patch addressing a row the base
no longer contains is otherwise ambiguous: it is either a one-off add for this
occurrence, or an edit to a row somebody deleted after the patch was written.
Merging cannot tell them apart, so it recreates the deleted row from whatever
fields the patch happened to carry — a fragment with no type and no position,
surfacing at the bottom of one occurrence's note, from a row the user deleted.
With tombstones the ambiguity is gone: an id present in the base is a real
target, live or dead, and an id absent from the base is genuinely new.

It also makes hiding reversible, within a limit worth stating. `rows.<id>: null`
discards the row's text and sort key along with it, so un-hiding has nothing to
restore; a tombstone keeps whatever the row last held, and un-hiding is
`attrs.deleted.<id>: null`. This is the successor to the old model's `removed`
boolean, and it works at both grains — the base hides a row for every
occurrence, an occurrence's patch hides it for that day alone.

**The limit:** a tombstone preserves the row's *last stored content*, not its
content before the edits that led to the delete. Clearing a row's text and then
backspacing the empty row — the natural gesture on a phone — stores an empty
string first, so reviving that row yields an empty line. This is not a defect in
the tombstone: each of those keystrokes was a real edit that other devices had
to see, and recovering pre-erasure content is undo, which the editor
deliberately does not do.

Reversibility is dependable in the case the model actually needs it:
**per-occurrence hiding**. Deleting a row for one occurrence writes the
tombstone into that occurrence's patch and never touches the base, so the row's
content survives intact and un-hiding restores it in full.

None of this touches the reason tombstones exist. The anti-resurrection
guarantee depends only on the id being present, never on the text.

**When a tombstone is not needed.** A tombstone protects a row against patches
that might reference it. Where no patch can — a standalone note, which has no
overrides by construction, or a series note before its first override row
exists — the row is removed outright with `rows.<id>: null`, and any tombstones
the document already carried are swept in the same write.

This is not a size optimisation. It is what stops ordinary drafting from leaving
debris: creating a row with Enter and backspacing it away is a normal editing
rhythm, and under tombstoning every one of those transient rows is kept forever.
Measured on a fresh note in the editor's demo, five such cycles leave five
ghosts and a stored document a third larger than what it renders.

The choice belongs to the **writer**, and properly to the **server** — the only
party that knows whether the note has overrides at the moment the write is
applied. A client must not cache it: an override created on another device
mid-session would make a hard delete unsafe in exactly the window where the
damage is hardest to spot. Sending `attrs.deleted` from the client and letting
the write endpoint downgrade it to a removal keeps the claim where the knowledge
is, and collects tombstones retroactively when a note's last override goes.

**Accepted consequence:** notes only grow. A heavily edited note carries every
row it ever had, and an occurrence's tick for a row the base later tombstoned
lingers where nothing reads it — correctly, as it happens: revive the row and
that occurrence shows it ticked, because it was.

There is deliberately **no compaction rule**. At household scale a note is
kilobytes, and reclaiming lines of JSON is not worth the risk of dropping a row
that some patch still points at. Revisit only if a real note ever grows large
enough for anyone to notice, which is not expected.

*Rejected:* putting the flag on the row (`rows.<id>.deleted`). Hiding a row for
one occurrence would then be a write into `rows`, breaking the split that keeps
content and per-occurrence state in separate keys — the same reason ticks live
in `attrs`.

### 7. Ownership decides whether an edit propagates
- A **standalone** note is edited in place. It has one context and no overrides.
- A **series** note is edited either at the base (every occurrence) or through
  that occurrence's patch (one occurrence).

There is no third kind. A standalone note is never *linked* to an occurrence —
if you want it on an event, you import it (Decision 11), and what arrives is
content, not a reference.

*Rejected:* linking a standalone note to occurrences, M:N. It makes a note's
identity depend on where it is being read from, and it means editing a note in
one place silently rewrites what someone else sees somewhere else. Importing is
explicit, and after it the two notes are simply two notes.

*Also rejected:* a flag that converts a note between owned and standalone. It
reads like a one-column change but it moves the source of truth for every
checklist row in the note — many occurrences of tick history would have to
collapse into one value, with no defensible rule for which occurrence wins.

### 8. Order is a fractional key inside the document
Each row carries a `sort` string (LexoRank / fractional-indexing style), so a
value can always be generated *between* any two existing ones. Inserting or
moving a row writes that one row, never its neighbours, and there is no ceiling
on how many rows a note can hold.

Read order is **`(sort, id)`**. Two clients generating a key for the same gap
while offline can produce the same value, and the tie must break identically on
both. A collision is a tie, not a conflict.

It also makes per-occurrence reordering a one-field patch: a moved row's
position is one value computed between its neighbours, rather than a property
spread across every row in the note.

*Rejected:* holding order as an array of row ids. It gives exact order rather
than approximate, but two concurrent insertions collide over the whole array
instead of merging, and an array is the one thing in this document that cannot
be merged element-wise. Worth revisiting only if approximate ordering proves
insufficient — and if it is ever adopted, the read rule must be *order is
advisory, never gates visibility*: render array order, then append any row the
array omits, so a stale array degrades to bad order and never to hidden content.

### 9. Every row has its own id, and identity is never derived from content
Headings included. Ids are minted, never computed from a row's text.

This reads like an obvious consequence of rows being rows, but it is what the
whole model rests on: patches, tick state and sort keys are all addressed by row
id. The moment a row's identity is a function of its text, renaming the row
orphans everything keyed to it, and two rows that happen to share text collapse
into one.

Both failures were reproduced, not theorised. The Notes editor's reference
adapter read a shape where headings were not rows but a group-label string, so
it had to *synthesise* heading identity and derived it from the label. Two
groups called "Pants" in one list — legal, and not rare — produced two rows with
the same id; because the document is keyed by row id, one was dropped on save. A
six-row note stored as five, a heading gone, no error. Renaming a heading moved
its id and orphaned everything attached to it.

### 10. Tick state is occurrence-grained, and never in a series note's base
`attrs.done` is a sparse map: present and `true` means ticked, absent means not.
For a standalone note it lives in `body`, which has exactly one context. For a
**series** note it lives only in the occurrence's `patch` — never in `body`.

That last rule is not fussiness. A series can stop being single-occurrence: edit
a one-off dinner into a weekly one and every tick that had gone to the base
would be inherited by every new occurrence, so next week's checklist arrives
pre-ticked. Keeping ticks out of the base makes that transition a no-op.

The invariant has a second and sharper way to break: **"save for all events."**
A user standing in one occurrence is looking at the merged document — the base
plus that occurrence's ticks. Dispatch their edit to the base by *writing that
document* and the ticks ride along, so one occurrence's checkboxes become every
occurrence's. Dispatch it as a patch and nothing can ride along.

Concretely, with a note holding `pants` and `trousers`, both ticked in week two,
then `trousers` deleted for all events:

```
as a patch      base gains  {"deleted":{"id2":true}}
as a document   base gains  {"done":{"id1":true},"deleted":{"id2":true}}
                            └─ week two's tick, now inherited by every week
```

This is Decision 12 arriving from a different direction: writes are patches,
never documents. There, the reason is concurrency; here it is that a patch
cannot carry state the user did not touch.

Content edits are free to default to the base for a single-occurrence series —
the interface need not ask "this occurrence or the series?" when there is only
one occurrence. It is only tick state that must never land there.

**Statuses beyond done** live in their own namespace, `attrs.flag`
(`'skipped' | 'blocked'`), which the editor does not read. They are orthogonal
to the tick: a row is done, or it is not done and possibly flagged. The hazard
is the write path — a flagged row reads as unticked in the editor, so an untick
originating there must clear `attrs.done` **only**, never the flag. A user
tapping twice must not erase a status they were never shown.

*Rejected:* projecting the flags into the editor as row types or text
decoration. It pushes Planner vocabulary into a general-purpose editor's model,
which would then be round-tripping a value it cannot represent.

### 11. Importing a note is an append-merge, never a replace
Importing standalone note **B** into series note **A** appends B's rows to A's:
generate sort keys after A's last row, then merge B's rows and attrs into A's
document. Row ids are uuids from different notes, so they are disjoint by
construction — there are no collisions to resolve and no content to reconcile.

Merge is chosen over replace because **replace destroys every override**.
Overrides address row ids that live in the *old* body; swap the body and each
one is either dead weight (an `attrs.done` entry naming nothing, harmlessly
ignored) or actively wrong: a partial row whose base is gone gets **resurrected
as a fragment**, so a stray item appears at the bottom of that occurrence from a
document the user deleted. Merge leaves A's row ids untouched, so every override
keeps working.

If a replace path is ever wanted anyway, implement it as *delete the note row,
insert a new one* — the cascade clears the overrides for free, and the new id is
honest, because it is a different document. Overwriting `body` in place keeps
the id and leaves the poison behind.

*Rejected:* reconciling by content — noticing that both notes say "milk" and
collapsing the two rows. That is a genuinely hard merge with no obviously right
answer, and "import this list into the event's note" does not mean it.

### 12. Concurrent edits are last-write-wins per field, applied server-side
There is no merge algorithm for conflicts and no lock. Two people editing one
note resolve field by field: the last write to a given path wins.

That is weaker than it sounds, because the shape makes the common cases disjoint
rather than conflicting. Two people ticking different rows write different paths
under `attrs.done`. Two people editing different rows write different paths
under `rows`. Two people inserting at the same position may generate the same
sort key — which is exactly why the read order is `(sort, id)`. The only true
conflict is two people typing into one row's text at once.

**Writes are patches, never documents.** The client sends a merge patch and the
server applies it to the column. A client that reads `body`, edits it and writes
it back loses every concurrent change between the read and the write — and since
ticks and text now share one column, that includes a tick someone else made
while you were typing. This is the rule that replaces the old model's
separate-tables seam, and it is the one that matters most.

Ordering comes from the server. Client clocks cannot order writes from two
devices, so a write carries a server-assigned sequence, never a client
timestamp.

*Not adopted:* a note-level lock. It serialises every conflict-free case above
to protect the one case that conflicts, and a lock held by a phone that walked
into a tunnel needs lease and timeout machinery the conflict does not justify.
If same-row collisions prove real, row-level presence — "someone has a caret in
this row" — is the proportionate answer, since the editor already tracks a
focused row id.

---

## The editor contract

Notes are edited by the **Notes** library (`~/Documents/_Projects/notes`), whose
model is a flat row array and whose storage codec is an id-keyed JSON document.
`body` is that document, so the correspondence is direct:

| This model | Notes library |
|---|---|
| `body.rows.<id>` | a row; `<id>` is `Row.id`, stable and never derived from content |
| `type` — `heading` / `check` / `para` | `Row.type` — `header` / `item` / `text` |
| `text` | `Row.text` |
| `sort` | the row's fractional sort key |
| `attrs.done` | `attrs.done` — read natively |
| `attrs.deleted` | `attrs.deleted` — tombstones, filtered out of the read |
| `attrs.flag` | not read; Planner's own gutter state |
| `note_occurrence_override.patch` | a `NotePatch` composed with `mergeDoc` |

The row-type vocabularies differ deliberately: Planner's words stay Planner's,
the library stays host-agnostic, and the adapter translates. Neither side
renames to match the other.

Three invariants the schema does not enforce but the editor requires:

- **A row's text never contains a newline.** The editor's model is one line per
  row, and it routes every multi-line path — paste, dictation, IME commit —
  through its parser. A newline arriving from the database is collapsed to a
  space on read, silently.
- **A note with no rows is not empty on screen.** The editor always holds at
  least one row, so a note with an empty `rows` object yields one blank check
  row that has no stored identity until the user types into it.
- **A deleted row is tombstoned, not removed** (Decision 6). The codec
  enforces this end to end: `parseDoc` skips tombstoned rows, and
  `serializeDoc` tombstones any row its previous document knew and the new
  rows no longer carry — so a delete made in the editor becomes a tombstone
  without the host arranging it.

---

## Notes on the keys

`note_one_per_series` is a **partial** unique index. A plain unique constraint
would also work in Postgres, since nulls are distinct — but the partial form
says what is meant, and stays correct if the null semantics are ever configured
otherwise.

`note_occurrence_override` has no nullable key columns: an override only exists
in an occurrence context, so both key columns are non-null and a plain composite
primary key enforces it.

Index `body` with GIN if note search or cross-note queries arrive. Nothing in
this model needs it yet.

---

## Build order

1. `note` — standalone notes and series notes, edited in place. Complete and
   usable on its own.
2. `note_occurrence_override` — per-occurrence divergence and tick state.

Import (Decision 10) is application code over stage 1 and needs no schema.

The editor can be wired at stage 1: it needs rows, ids and sort keys, and reads
a note with no overrides as an ordinary document.
