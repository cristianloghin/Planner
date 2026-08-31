# Planned — designed, not built

Features with a design of record that do **not** exist yet, in the schema or the
app. Each entry says what it is, where its design lives, and what building it
would touch.

Nothing here is scheduled. Split out of the old `NEXT_SESSION.md`, whose build
work is done (see [`STATUS.md`](./STATUS.md)).

> **Migration numbers.** The original designs named `0012_shares.sql` and
> `0013_list_visibility.sql`. Both numbers were taken by colour work
> (`0012_event_color`, `0013_user_color`). Use the next free number when either
> is built — the schema is at `0021` at the time of writing.

> **Architecture note.** The wiring below is described against the *current*
> data layer (`AppState`, the reducer, `SupabaseStore`). The restructure in
> [`RESTRUCTURE_PLAN.md`](./RESTRUCTURE_PLAN.md) dissolves all three. If it lands
> first, read "add a `loadX` to `SupabaseStore` + a reducer case" as "add a
> `client/x.ts` function + a domain query".

---

## 1. Shares & pins

A unified attention mechanism on a **concrete occurrence**: **share** it to
another user (in-app inbox + toast) or **pin** it for yourself (private
quick-jump, no notification). Both are rows in one `occurrence_share` table — a
pin is just a self-share.

Design of record:
[DATA_MODEL Decision 12](./DATA_MODEL.md#12-shares--pins--one-occurrence-grain-table-occurrence_share)
— schema, RLS, and the *why* (single policy, `kind` flag, occurrence identity).

**Build plan:**

1. **Migration** — `occurrence_share` + RLS
   (`to_user = auth.uid() or from_user = auth.uid()`) + grants + add to the
   realtime publication **with `REPLICA IDENTITY FULL`** so dismiss/un-pin
   (DELETE) syncs (the bug fixed in `0011`).
2. **Reads/writes** — a `loadShares()` (RLS returns just the user's visible
   rows); `shareOccurrence` / `pinOccurrence` (insert) and `dismissShare` /
   `unpin` (delete, or set `read_at` for read state). `occurrence_start` via the
   existing `occurrenceTs(ev, date)` helper, exactly like dependencies and to-do
   links.
3. **State** — `shares` in `AppState`; the app splits the loaded array into
   `favorites` (pins), `inbox` (shares to me) and `sent` (shares from me).
   Realtime already reloads on change, so a partner's share lands within ~300ms
   while their app is open.
4. **UI** — a star + "Share with…" picker in `OccurrenceSheet` (where dependency
   and to-do linking already live); a favorites list and an inbox badge; clicking
   either jumps to the occurrence's day. The toast fires only for
   `kind='share', to_user = me, from_user <> me` — pins are silent.
5. **`split_series`** — decide whether to migrate future `occurrence_share` rows
   onto the new series id (mirror the other occurrence-grain tables, as `0017`
   does for `list_item_event_link`) or leave them.

**This is now smaller than originally scoped.** The design was written when a
push to a closed app needed infrastructure that did not exist. It does now — see
[`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md): `push_subscription`
(`0018`), the `send-reminders` edge function, VAPID secrets, pg_cron, and a
service-worker `push` handler are all live. A share push reuses that path rather
than building it.

---

## 2. Private lists — per-list visibility

Opt-in per-list privacy on top of the Lists feature. A list gains `owner_id` +
`visibility` (`account` | `private`); items **inherit** the list's scope; a link
still exposes a **single item** to event-viewers without exposing its list. The
worked example: a private list stays invisible, but an item linked from it shows
(and ticks) inside a shared event.

Design of record:
[DATA_MODEL Decision 13](./DATA_MODEL.md#13-private-lists--per-list-visibility-scope)
— including both RLS branches in full.

**Build plan:**

1. **Migration** — add `owner_id`/`visibility` to `list`; tighten
   `can_access_list` to also require
   `(visibility = 'account' or owner_id = auth.uid())`; replace the `list_item`
   SELECT policy with the OR (**list-derived** *or* **link-exposed**); decide the
   `list_item` UPDATE policy (mirror the OR, or a `SECURITY DEFINER` done-only
   RPC).
2. **Reads** — a `loadLinkedItems()` that fetches link-attached `list_item`s the
   viewer can see but whose list they can't, into a `linkedItems` lookup;
   `OccurrenceSheet` reads linked to-dos from that lookup, **not** from the
   loaded lists. List loading keeps grouping only *visible* lists. New lists
   default to `owner_id = me`, `visibility = 'account'`.
3. **State** — `linkedItems`; an action to set a list's visibility.
4. **UI** — a private/shared toggle (+ lock glyph) in the Lists view; the
   occurrence view renders link-exposed items identically whether or not their
   list is visible.

**Watch-outs.** Assignment (`person_id`, a domain `person`) is **not** visibility
(an `app_user`) — keep them separate. Ticking a link-exposed private item must
still write the one `list_item.done`, which is the UPDATE-policy question above.

---

## 3. The note model

A looser, more flexible way to attach information to an occurrence — a note as a
small ordered document of headings, checklist rows and paragraphs, standalone or
series-owned, with sparse per-occurrence divergence.

Design of record: [`NOTE_MODEL.md`](./NOTE_MODEL.md), which is complete and
includes its own staged build order. None of its tables (`note_row`,
`row_state`, `note_row_override`, `note_occurrence_link`) exist.

**One collision to resolve first.** The design calls itself parallel — standing
alongside what exists and taking nothing over — but its `note` table is not the
`note` table in the live schema. `0001`'s is series-owned with a single `body`
and a `NOT NULL owner_series_id`
([Decision 6](./DATA_MODEL.md#6-notes-are-seriesowned-1n-symmetric-with-items));
the design's has `account_id`, a nullable owner, a `title`, and its content in
`note_row`. Same name, incompatible shape. Building it means altering the
existing table or renaming one of the two — decide which before starting.

---

## 4. RLS granularity

The baseline policies let any account member read and write the account's series
and lists. Add an `account_member.role` check if owner-only writes are ever
wanted. Nothing in the app depends on this today.
