-- ============================================================================
-- 0009_lists.sql — Standalone Lists (DATA_MODEL.md Decision 11).
--
-- The undated to-do view becomes two account-scoped tables plus one
-- occurrence-grain link:
--   * list                  — a named list.
--   * list_item             — one to-do; `done` lives ON the item (single
--                             context — no per-occurrence tick table), with an
--                             in-list `group_label` header (like checklist_item)
--                             and an optional `due_on` deadline.
--   * list_item_event_link  — surfaces a to-do inside a CONCRETE event
--                             occurrence; same grain/rules as occurrence_dependency
--                             (occurrence_start is the original slot and is NOT an
--                             FK — most occurrences are virtual; Decision 4).
--
-- One source of truth for the tick is `list_item.done`: ticking a linked to-do
-- in the occurrence or in the Lists view writes the same row. A linked to-do is
-- a convenience line, NOT a `required` checklist item, so it never gates the
-- occurrence's completion (Decision 7's math ignores it).
-- ============================================================================

create table list (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  title      text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index on list (account_id);

create table list_item (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references list(id) on delete cascade,
  group_label text,                                          -- in-list header; null = ungrouped
  title       text not null,
  done        boolean not null default false,                -- single-context: lives on the item
  person_id   uuid references person(id) on delete set null, -- assignee; null = shared
  due_on      date,                                          -- optional deadline; null = none
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index on list_item (list_id);

-- Ties a to-do to a concrete occurrence. occurrence_start is the ORIGINAL slot
-- and is deliberately NOT an FK (most occurrences are virtual — Decision 4); its
-- integrity is maintained by the app's calendar library. Both ends cascade:
-- deleting the event drops the link, never the to-do.
create table list_item_event_link (
  list_item_id     uuid not null references list_item(id)    on delete cascade,
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  created_at       timestamptz not null default now(),
  primary key (list_item_id, series_id, occurrence_start)
);
create index on list_item_event_link (series_id, occurrence_start);

-- ---- RLS: account-scoped, same model as everything else ----
-- Helpers (SECURITY DEFINER so they bypass RLS while evaluating policies),
-- mirroring can_access_series (0002).
create or replace function can_access_list(p_list uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from list l
    where l.id = p_list and is_account_member(l.account_id)
  );
$$;

create or replace function can_access_list_item(p_item uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from list_item i join list l on l.id = i.list_id
    where i.id = p_item and is_account_member(l.account_id)
  );
$$;

alter table list                 enable row level security;
alter table list_item            enable row level security;
alter table list_item_event_link enable row level security;

create policy list_rw on list for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));

create policy list_item_rw on list_item for all to authenticated
  using (can_access_list(list_id)) with check (can_access_list(list_id));

-- Link edge: visible/editable if you can access either end, but only writable
-- when you can access BOTH (you can't link someone else's to-do or event).
-- Mirrors dependency_rw (0002).
create policy list_item_event_link_rw on list_item_event_link for all to authenticated
  using (can_access_list_item(list_item_id) or can_access_series(series_id))
  with check (can_access_list_item(list_item_id) and can_access_series(series_id));

-- ---- grants (explicit; don't rely on 0004's default privileges) ----
grant select, insert, update, delete on list                 to authenticated;
grant select, insert, update, delete on list_item            to authenticated;
grant select, insert, update, delete on list_item_event_link to authenticated;

-- ---- realtime: stream list changes like the other shared tables (0006) ----
alter publication supabase_realtime add table
  list,
  list_item,
  list_item_event_link;
