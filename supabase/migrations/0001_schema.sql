-- ============================================================================
-- 0001_schema.sql — Planner backend schema.
-- Design rationale: docs/DATA_MODEL.md. Three grains: series, occurrence, lookup.
-- Occurrence rows are SPARSE (only divergences stored). occurrence_start is the
-- ORIGINAL slot and is intentionally NOT an FK (occurrences are virtual).
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Lookup tables (enum-as-table). Public read; seeded here; no client writes.
-- ----------------------------------------------------------------------------
create table item_status       (code text primary key);
create table occurrence_status (code text primary key);
create table rsvp_status       (code text primary key);
create table participant_role  (code text primary key);
create table reminder_method   (code text primary key);

insert into item_status(code)       values ('done'), ('skipped'), ('blocked');
insert into occurrence_status(code) values ('done'), ('skipped'), ('blocked');
insert into rsvp_status(code)       values ('invited'), ('accepted'), ('declined'), ('tentative');
insert into participant_role(code)  values ('organizer'), ('participant'), ('optional'), ('second');
insert into reminder_method(code)   values ('app'), ('push'), ('email');

-- ----------------------------------------------------------------------------
-- Identity & tenancy. app_user mirrors auth.users (see 0003 trigger). The
-- account is the RLS boundary; a user can belong to several.
-- ----------------------------------------------------------------------------
create table app_user (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create table account (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table account_member (
  account_id uuid not null references account(id)  on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  role       text not null default 'member',   -- 'owner' | 'member' (app-defined)
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index on account_member (user_id);

-- ----------------------------------------------------------------------------
-- SERIES grain. The aggregate root: one-offs, repeats and templates all here.
-- rrule is UNTIL-or-infinite, NEVER COUNT (see DATA_MODEL.md Decision 2).
-- ----------------------------------------------------------------------------
create table event_series (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references account(id) on delete cascade,
  title          text not null default '',
  all_day        boolean not null default false,
  dtstart        timestamptz,                       -- null only on templates
  duration       interval not null default interval '0',
  rrule          text,                              -- null = one-off; else RFC-5545, UNTIL/infinite
  timezone       text not null default 'UTC',
  is_template    boolean not null default false,
  template_id    uuid references event_series(id) on delete set null, -- provenance; null = standalone
  split_from_id  uuid references event_series(id) on delete set null, -- this-and-following lineage
  default_status text references occurrence_status(code),
  created_by     uuid references app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- a template has no schedule; a concrete series must have a start
  constraint template_or_scheduled check (is_template or dtstart is not null)
);
create index on event_series (account_id);
create index on event_series (template_id);

-- ----------------------------------------------------------------------------
-- OCCURRENCE grain. Sparse divergences from the series default.
-- ----------------------------------------------------------------------------
create table event_occurrence (
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,            -- ORIGINAL slot = identity
  rescheduled_to   timestamptz,
  cancelled        boolean not null default false,
  status           text references occurrence_status(code), -- checklist-less mark-done; null = compute
  primary key (series_id, occurrence_start)
);

-- ----------------------------------------------------------------------------
-- Checklist (series-owned, copy semantics). A "list item" (occurrence_start
-- null) belongs to every occurrence; a set occurrence_start is a one-off add.
-- ----------------------------------------------------------------------------
create table checklist_item (
  id               uuid primary key default gen_random_uuid(),
  owner_series_id  uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz,         -- null = list item; set = one-off add to one occurrence
  group_label      text,
  label            text not null,
  required         boolean not null default true,
  sort_order       int not null default 0
);
create index on checklist_item (owner_series_id);

-- Tombstone: hide a list item on one occurrence (the inverse of a one-off add).
create table occurrence_item_removed (
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  item_id          uuid not null references checklist_item(id) on delete cascade,
  primary key (series_id, occurrence_start, item_id)
);

-- Checkmarks. Keyed by item (the membership row), so the same line checked on
-- different occurrences is independent. Presence + status carries the state.
create table occurrence_item_state (
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  item_id          uuid not null references checklist_item(id) on delete cascade,
  status           text not null references item_status(code),
  completed_at     timestamptz not null default now(),
  primary key (series_id, occurrence_start, item_id)
);

-- ----------------------------------------------------------------------------
-- Roster, RSVP, requirements.
-- ----------------------------------------------------------------------------
create table event_participant (
  series_id  uuid not null references event_series(id) on delete cascade,
  user_id    uuid not null references app_user(id)     on delete cascade,
  role       text not null references participant_role(code),
  rsvp       text not null references rsvp_status(code) default 'invited',
  invited_by uuid references app_user(id),
  primary key (series_id, user_id)
);

create table occurrence_participant_override (
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  user_id          uuid not null references app_user(id) on delete cascade,
  rsvp             text references rsvp_status(code),
  removed          boolean not null default false,    -- tombstone: off this occurrence
  primary key (series_id, occurrence_start, user_id)
);

create table participation_requirement (
  id        uuid primary key default gen_random_uuid(),
  series_id uuid not null references event_series(id) on delete cascade,
  role      text not null references participant_role(code),
  min_count int  not null default 1 check (min_count >= 0)  -- satisfied when accepted >= min
);
create index on participation_requirement (series_id);

-- ----------------------------------------------------------------------------
-- Reminders (per user, series-level rule) + sparse sent-log.
-- ----------------------------------------------------------------------------
create table reminder (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references event_series(id) on delete cascade,
  user_id        uuid not null references app_user(id)     on delete cascade,
  offset_seconds int  not null,                  -- seconds before occurrence_start (1200 = 20 min)
  method         text not null references reminder_method(code) default 'app'
);
create index on reminder (series_id);

create table notification_log (
  series_id        uuid not null references event_series(id) on delete cascade,
  occurrence_start timestamptz not null,
  user_id          uuid not null references app_user(id) on delete cascade,
  reminder_id      uuid not null references reminder(id) on delete cascade,
  sent_at          timestamptz not null default now(),
  dismissed_at     timestamptz,                  -- snooze / dismiss
  primary key (series_id, occurrence_start, user_id, reminder_id)
);

-- ----------------------------------------------------------------------------
-- Notes (series-owned, 1:N — symmetric with checklist items; no M:N junction).
-- ----------------------------------------------------------------------------
create table note (
  id              uuid primary key default gen_random_uuid(),
  owner_series_id uuid not null references event_series(id) on delete cascade,
  author_id       uuid references app_user(id),
  body            text not null default '',
  metadata        jsonb not null default '{}',   -- pressure-valve for structured extras
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on note (owner_series_id);

-- ----------------------------------------------------------------------------
-- Dependencies — enumerated per-occurrence edges ("dinner waits on shopping").
-- App materialises edges; split_series rescues them on both ends.
-- ----------------------------------------------------------------------------
create table occurrence_dependency (
  dependent_series        uuid not null references event_series(id) on delete cascade,
  dependent_occurrence    timestamptz not null,
  prerequisite_series     uuid not null references event_series(id) on delete cascade,
  prerequisite_occurrence timestamptz not null,
  required_status         text not null references occurrence_status(code) default 'done',
  created_at              timestamptz not null default now(),
  primary key (dependent_series, dependent_occurrence, prerequisite_series, prerequisite_occurrence)
);
create index on occurrence_dependency (prerequisite_series, prerequisite_occurrence);
