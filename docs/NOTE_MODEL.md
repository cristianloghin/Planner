# The Note Model

A looser, more flexible way to attach information to an occurrence.

A **note** is a small ordered document. It can stand on its own, or belong to an
event series. Its content is a sequence of **rows** — a heading, a checklist
item, or a paragraph — so one note can be a shopping list, a set of
instructions, a scribble, or all three at once.

**Status: design, ready to build.** The per-event notes, checklists and lists
that once existed were removed in the strip-down (`0022`), so this is the only
notes structure and takes over nothing. This document specifies storage, the
rules that govern it, and the one contract the app has with the editor whose
format it stores: [the library contract](#the-library-contract). How any of it
is rendered is out of scope.

The editor is the **Notes** library (`@mikrostack/notes`, source in
`~/Documents/_Projects/notes`). The stored document is the library's own
format. The app stores it and never reads inside it (Decision 13).

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
  body            jsonb not null default '{"rows":{}}',   -- the library's document; opaque here
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A series has at most one note. Standalone notes are null and unconstrained.
create unique index note_one_per_series
  on note (owner_series_id) where owner_series_id is not null;

-- Sparse per-occurrence divergence: one patch per occurrence.
-- No series_id — the note already knows its series.
create table note_occurrence_override (
  note_id          uuid not null references note(id) on delete cascade,
  occurrence_start timestamptz not null,
  patch            jsonb not null default '{}',            -- the library's patch; opaque here
  updated_at       timestamptz not null default now(),
  primary key (note_id, occurrence_start)
);
```

Both tables get the usual wiring: row-level security through account
membership (`is_account_member` on `note.account_id`; a `can_access_note`
helper for the override table, in the shape of `can_access_series`), full
replica identity, and membership of the realtime publication.

---

## The document

`body` is the library's **document** and `patch` is the library's **patch**.
Both are JSON whose shape the library defines. They are shown here so the
decisions below can be read, not because the app depends on them — nothing in
the app names a key inside either.

```json
{
  "rows": {
    "5c1f…": { "type": "header", "text": "Hardware", "sort": "a1" },
    "9a02…": { "type": "item",   "text": "screws",   "sort": "a2" },
    "b73d…": { "type": "text",   "text": "from the blue bin", "sort": "a3" }
  },
  "attrs": {
    "done":    { "9a02…": true },
    "deleted": { "1e88…": true }
  }
}
```

Rows are an object keyed by row id — never an array — so every write is
addressable by path and no row's position depends on another's. A row is never
removed from `rows` in a series note. Deleting marks it in `attrs.deleted` and
the read skips it (Decision 6).

`patch` is a **JSON merge patch** (RFC 7386 semantics) over that document.
Present keys merge, `null` deletes, and anything unmentioned inherits:

```json
{
  "rows": { "9a02…": { "text": "brass screws" } },
  "attrs": { "done": { "9a02…": true }, "deleted": { "b73d…": true } }
}
```

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
foreign key at. Its integrity is the application's job. This is the same key
`event_occurrence` uses, computed the same way.

### 3. The note is one JSON document, not a table of rows
Rows, their order and their tick state all live in `body`. A note is read whole,
written whole, and never joined.

The structure a row-per-table model buys — per-row foreign keys, SQL-side
aggregation, row-grain history — buys nothing here, because a note is always
read as a unit and its rows reference nothing. What it costs is a table, a
second table for tick state, a third for divergence, and a hand-rolled patch
format spread across nullable columns.

*Rejected:* `note_row` + `row_state` + `note_row_override`. Every one of those
tables turned out to be a JSON merge patch wearing a schema: nullable
field-means-inherit is patch absence, a `removed` boolean is a `null` tombstone,
and presence-carries-tick is a sparse map. Expressing them as JSON is the same
model with three fewer tables and a merge the library already implements.

**Accepted consequences:** no foreign key can reach inside a row, so note rows
stay pure content — a per-row assignee would have to be a bare id with no
cascade. Aggregate queries ("how many items are unticked across the account")
move from SQL to the application or to a GIN index. And Postgres rewrites the
whole `body` on every save, which is why a save is an explicit act rather than
a keystroke (Decision 15).

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

### 6. In a series note, deletion is a tombstone, never a removal
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
`attrs.deleted.<id>: null`. It works at both grains — the base hides a row for
every occurrence, an occurrence's patch hides it for that day alone.

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

**A standalone note removes rows outright.** A tombstone protects a row against
patches that might reference it, and a standalone note has no overrides by
construction — ownership never changes (Decision 7), so it never will. Its
deletes are `rows.<id>: null`, and the library's codec sweeps any tombstones on
the same write.

This is not a size optimisation. It is what stops ordinary drafting from leaving
debris: creating a row with Enter and backspacing it away is a normal editing
rhythm, and under tombstoning every one of those transient rows is kept forever.
Measured on a fresh note in the editor's demo, five such cycles leave five
ghosts and a stored document a third larger than what it renders.

The rule is decided by **ownership alone**, which is a column that never
changes. An earlier draft let a series note drop rows until its first override
existed; that made the safe choice depend on a fact only the server could know
at write time, for a saving nobody would notice. A series note tombstones from
its first keystroke.

**Accepted consequence:** series notes only grow. A heavily edited one carries
every row it ever had, and an occurrence's tick for a row the base later
tombstoned lingers where nothing reads it — correctly, as it happens: revive the
row and that occurrence shows it ticked, because it was.

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

Both failures were reproduced, not theorised, in an earlier adapter that
synthesised heading rows from a group label: two groups called "Pants" produced
two rows with one id, and one was dropped on save. The library mints every id
itself now, and the app never synthesises a row.

### 10. Tick state is occurrence-grained, and never in a series note's base
`attrs.done` is a sparse map. For a standalone note it lives in `body`, which
has exactly one context. For a **series** note it lives only in the occurrence's
`patch` — never in `body`.

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

So **an edit is a patch**, always: the library hands the app one patch per edit,
naming only what the user touched, and the app routes it — a tick on a series
note to the occurrence, everything else to wherever the user chose. What is then
*saved* is a different question (Decision 12); the invariant depends only on the
edit being a patch when it is routed.

Content edits are free to default to the base for a single-occurrence series —
the interface need not ask "this occurrence or the series?" when there is only
one occurrence. It is only tick state that must never land there.

**Statuses beyond done** (skipped, blocked) are not in this model. If they are
ever wanted they are the app's own, kept outside the document and keyed by the
row id the library exposes, because the app does not write into the document
(Decision 13).

### 11. Importing a note is an append-merge, never a replace
Importing standalone note **B** into series note **A** appends B's rows to A's:
generate sort keys after A's last row, then merge B's rows and attrs into A's
document. Row ids come from different notes, so they are disjoint by
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

The append itself is a library operation (it needs sort keys and the document's
shape), asked for through the library contract, not written in the app.

*Rejected:* reconciling by content — noticing that both notes say "milk" and
collapsing the two rows. That is a genuinely hard merge with no obviously right
answer, and "import this list into the event's note" does not mean it.

### 12. A save is the whole document, and the last save wins
Every edit is a patch (Decision 10), but what the app **saves** is the merged
result: the base body after the patch, or the occurrence's patch after the
patch. `body` and `patch` are written as whole columns, by the client, through
an ordinary upsert. No merging happens on the server.

Concurrent edits therefore resolve **per document**: two people editing one
note's base at the same moment overwrite each other, and so do two people on the
same occurrence. Different occurrences never collide, because each is its own
row, and a tick on a series note never collides with a text edit on the base,
because they are different rows too.

This is a weaker guarantee than merging on the server, and it is chosen with
that cost understood. A note is saved when its editor is closed with Save
(Decision 15), and every device re-reads a note the moment another device's
save lands, so two people overwrite each other only when both had the same note
open for editing at once — at household scale, a thing that will rarely happen
and will be visible when it does. Against that, server-side merging needs
a recursive merge-patch function in Postgres and an RPC per table, none of which
exists, all of which would have to be maintained against a format the server
does not otherwise know.

**The upgrade path is one function wide.** The app holds patches either way;
only the client function that performs the save decides whether it writes
`merge(previous, patch)` as a column or sends `patch` to the server. If
same-document collisions ever prove real, add the merge function and change that
one call. Nothing above the client layer notices.

Ordering comes from the app's write queue: every write shares one scope, so
saves go out in the order they were made, even after a spell offline. There is
no server-assigned sequence — the app never applies change payloads, it
re-reads on change, so a sequence would have no reader.

*Not adopted:* a note-level lock. It serialises every conflict-free case above
to protect the one case that conflicts, and a lock held by a phone that walked
into a tunnel needs lease and timeout machinery the conflict does not justify.
If same-row collisions prove real, row-level presence — "someone has a caret in
this row" — is the proportionate answer, since the editor already tracks a
focused row id.

### 13. The app is blind to the document's format
`body` and `patch` are opaque values to the app. No code in the app names a row
type, an attribute namespace, a sort key, or any key inside either column. The
app knows exactly three things about them:

1. a document can be **parsed into rows** the editor shows;
2. a document and a patch can be **merged** into a document;
3. an **edit produces a patch**, and patches compose by merging.

All three are the library's functions (see [the library contract](#the-library-contract)).
The app's own vocabulary stops at *note*, *body*, *patch* and *row id*.

This is what keeps the two projects independent. The library can change its
document shape, add a row type or an attribute namespace, and the app carries
it through storage untouched; the app can change how it stores, routes or
displays a note without the library knowing. An earlier draft gave the app its
own row-type names and a translation table; the library reads `type` straight
from storage, so that adapter would have had to run over every row on every
read and every patch on every write, for no gain.

**Accepted consequence:** the app cannot answer questions about a note's
content — how many items are unticked, which rows are headings — without
parsing it through the library first. That is fine: parsing is pure and cheap,
and the app never needed to know the shape, only the rows.

### 14. A note follows its series through a split and a template
Two operations produce a new series from an old one, and both carry the note.

**"Edit this and following"** cuts a series in two (`split_series`, `0024`).
The new half gets a note of its own: a new `note` row with the old note's
`body` copied verbatim, and every override row with `occurrence_start` at or
after the cut moves to the new note. Row ids stay the same because the two are
now two documents (Decision 11's reasoning, in reverse), so the moved overrides
keep addressing rows that exist. This runs inside the split transaction,
alongside the reminders and the per-day rows it already carries.

**New from template.** A template is a series row with no date, so the schema
lets it own a note, and it should: a template that carries its checklist is the
point of a template. Making an event from it copies the template's `body` into
the new event's note, the way its reminders are copied. Ticks are never in a
template's base (Decision 10), so nothing arrives pre-ticked.

*Rejected:* sharing one note between a template and the events made from it.
That is a link (Decision 7), and editing the template would rewrite every
event's note under its owner.

### 15. A note is saved on Save, not as it is typed
The note page is a form, in the shape of the event and template editors: the
note is read once when the page opens, edits accumulate as patches on the
device, and the Save button writes the whole note and closes the page. Leaving
without saving discards the edits, as it does in every other editor in the app.

This is chosen over saving a beat after each keystroke, which an earlier draft
specified. Autosave needs a debounce, a flush when the page is left or hidden,
and a rule for holding back re-reads while a save is in flight so that an older
document cannot land under the user's fingers — three pieces of timing logic
whose failures are silent. An explicit save has none of them: nothing is
written until the user says so, and by then the editor is closed. What the
user saw is what is saved.

**Accepted consequences.** A change made on another device while a note is
open for editing is not shown, and is overwritten on Save (Decision 12). A
phone that drops the page loses unsaved edits, as it would in the event
editor. Both are the price of a write path with no timing in it; revisit if
either is ever felt.

---

## The library contract

The app uses the library through its public surface only. What it needs, and
what the library provides today:

| the app needs | the library provides |
|---|---|
| parse a document into rows | `parseDoc(body)` |
| merge a document with one or more patches | `mergeDoc(body, ...patches)` |
| turn one edit into one patch | **not yet exported** — the derivation exists in the library's demo and moves into the package as its next release |
| append one document's rows to another (Decision 11) | not yet; needed at the import stage, not before |
| feed rows in, receive edits out | `NoteStore.connect(source)` and `onAction` |
| ids for new rows | the library mints them; the app injects nothing |

The `Editor` and `Toolbar` components render through render props and ship no
CSS, so the app's skin is its own and lives with the app's other styles.

Three invariants the schema does not enforce and the library owns end to end,
recorded so nobody adds a check for them in the app:

- **A row's text never contains a newline.** The editor routes every multi-line
  path — paste, dictation, IME commit — through its parser, and collapses a
  newline arriving from storage to a space on read.
- **A note with no rows is not empty on screen.** The editor always holds at
  least one row, so an empty document yields one blank item row that has no
  stored identity until the user types into it.
- **Deleting tombstones or removes according to what the app asks** (Decision
  6): the app says which, by ownership, and the library's patch does the rest.

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

0. The library exports its edit-to-patch function. Everything below reads
   patches from it; nothing starts before it ships.
1. `note` — standalone notes and series notes, edited in place, and carried
   through a split and a template (Decision 14). Complete and usable on its own.
2. `note_occurrence_override` — per-occurrence divergence and tick state.

Import (Decision 11) is application code over stage 1, needs no schema, and
waits on the library's append operation.
