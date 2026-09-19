-- ============================================================================
-- 0025_notes.sql — notes, stage 1: the note itself (docs/NOTE_MODEL.md).
--
-- A note is one JSON document in the format of the editor that writes it
-- (`@mikrostack/notes`). The app stores `body` as a sealed value: it never
-- names a key inside it, and the only things it does with the column are read
-- it whole and write it whole (NOTE_MODEL Decisions 3, 12 and 13).
--
-- Two kinds of note share the row (Decision 1): a standalone note, which
-- `owner_series_id` leaves null, and a series note, which points at its
-- event. Only standalone notes are built at this stage; the owner column and
-- its index are here so the series stage is a code change, not a schema one.
-- The per-occurrence override table (stage 2) is not created yet.
--
-- The old `note` table of the same name was the pre-strip-down per-event text
-- block, dropped in 0022. This one has nothing to do with it.
-- ============================================================================

create table note (
  id              uuid primary key default gen_random_uuid(),
  -- Tenancy. Always set, and the only thing access control looks at.
  account_id      uuid not null references account(id) on delete cascade,
  -- Ownership. Null for a standalone note; a series for a series note. Never
  -- changes after creation (Decision 7).
  owner_series_id uuid references event_series(id) on delete cascade,
  title           text not null default '',
  -- Who wrote it. A filter for "mine" and "theirs", not access control, and
  -- stamped once: editing someone else's note must not reassign it.
  author_id       uuid not null references app_user(id),
  -- The editor's document, opaque here. An empty note is `{"rows":{}}`, which
  -- the editor renders as one blank row.
  body            jsonb not null default '{"rows":{}}'::jsonb,
  -- The house pressure valve for structured extras, as on the event tables.
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The account's notes are read as one list.
create index on note (account_id);

-- A series has at most one note (Decision 4). Partial, so standalone notes
-- are unconstrained; the nulls-are-distinct default would also allow it, but
-- the partial form says what is meant.
create unique index note_one_per_series
  on note (owner_series_id) where owner_series_id is not null;

-- Access is account membership, whoever owns the note (Decision 1). Table
-- privileges come from 0004's default grants.
alter table note enable row level security;
create policy note_rw on note for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));

-- Realtime. The gating column is not in the primary key, so a DELETE would be
-- filtered out for partners without the whole old row in the WAL (see 0011).
alter table note replica identity full;
alter publication supabase_realtime add table note;
