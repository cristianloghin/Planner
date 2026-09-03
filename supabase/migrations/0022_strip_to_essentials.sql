-- ============================================================================
-- 0022_strip_to_essentials.sql — docs/CLEANUP_PLAN.md as one migration.
--
-- Built up section by section as the plan lands. Order inside the file follows
-- the plan's §4 rule: drop the old functions first, then change the schema,
-- then create the new bodies last — SQL-language bodies are parsed against the
-- schema at `create` time, so creating them last makes the migration check
-- itself. plpgsql bodies are not, and fail only when called.
--
-- DESTRUCTIVE AND IRREVERSIBLE against the hosted project, which has no staging
-- twin. Apply deliberately, `supabase db push --dry-run` first.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- §9. The series split — drop the RPC. FIRST, before any schema change.
-- ---------------------------------------------------------------------------

-- An edit now goes to the whole series or to one occurrence, and to nothing in
-- between. `split_series` was the most intricate SQL in the schema and the only
-- writer of `event_series.split_from_id`; the app no longer calls it.
--
-- It has to go before the tables and columns it names, not after: the body is
-- plpgsql, so `drop table ... cascade` does not take it, and it reads
-- `default_status` and copies `note` / `checklist_item` / list-link /
-- `event_participant` / `participation_requirement` rows. A survivor would be a
-- dead object that fails at its first call. Recreated in 0003, 0010 and 0017;
-- all three definitions are history once this lands, and the `grant execute`
-- from 0017 goes with the function.
drop function split_series(uuid, timestamptz, text);

-- §1: the to-do search RPC (0014, recreated in 0017). A SQL-language body's
-- dependency on a table is not recorded, so this would survive the table drops
-- below as a dead object that errors if ever called. Its grant goes with it.
drop function search_list_items(uuid, text);

-- §2: search_events loses its `snippet` column, which changes the
-- `returns table (…)` signature — so it cannot be a `create or replace`. It is
-- recreated at the very bottom of this migration, after the schema settles: the
-- body is SQL-language, so it is parsed at `create` time and creating it last
-- makes this migration check itself.
drop function search_events(uuid, text);


-- ---------------------------------------------------------------------------
-- §1. Lists — the whole feature.
-- ---------------------------------------------------------------------------

-- The tab, the model and the occurrence links all go. RLS policies, grants,
-- indexes and realtime publication membership go with the tables, so 0009's
-- and 0011's statements need no separate reversal.
drop table list_item_event_link, list_item, list cascade;

-- 0009's RLS helpers, and these come AFTER the tables, not before: an RLS
-- policy's dependency on a function *is* recorded, so dropping these while
-- list_item_rw still existed would fail with "other objects depend on it".
-- Dropping the tables takes their policies, which frees the functions.
drop function can_access_list(uuid), can_access_list_item(uuid);

-- ---------------------------------------------------------------------------
-- §2. Notes on events — remove entirely.
-- ---------------------------------------------------------------------------

-- Events keep no free text. Takes its RLS policy, grants, replica identity and
-- realtime publication membership with it. `split_series` copied note rows on a
-- split; it was dropped above, so no function body is left naming the table.
drop table note cascade;

-- ---------------------------------------------------------------------------
-- §3a/§3b. Dependency linking and occurrence status — both entirely.
-- ---------------------------------------------------------------------------

-- No linking anywhere in the structure. Its RLS, its index and its 0008
-- publication membership go with it; 0011 left it at default replica identity,
-- so there is nothing else.
drop table occurrence_dependency;

-- And no occurrence status at all. After this an occurrence cannot be marked
-- done by any means: the only per-day facts the app records are *moved* and
-- *cancelled*.
--
-- These two are dropped as COLUMNS, explicitly. Dropping `occurrence_status`
-- with `cascade` instead would remove the FK constraints and leave the columns
-- sitting there holding stale text.
--
-- The stored values are deliberately carried nowhere — not folded into the new
-- `metadata` bag below. Preserving them would invite keeping the code that
-- reads them, and the point is that no such code survives.
alter table event_occurrence drop column status;
alter table event_series drop column default_status;

-- Now that its last three referencing columns are gone (default_status,
-- event_occurrence.status and occurrence_dependency.required_status). With
-- this and reminder_method gone, item_status is the last enum-as-table
-- lookup standing; §7 takes it.
drop table occurrence_status;


-- ---------------------------------------------------------------------------
-- §3c. A freeform `metadata` bag on both event tables — ADDED, not removed.
-- ---------------------------------------------------------------------------

-- The house pattern already used by note.metadata (0001:181, "pressure-valve
-- for structured extras") and in spirit by user_preference.prefs. A place for
-- things the schema has no column for, added now so it exists when something
-- needs it.
--
-- Nothing is written into it by this change, and the app neither reads nor
-- writes it. That is safe by construction: saveSeries upserts a named column
-- list, and writeOccurrenceRow does a partial update on an existing row or an
-- upsert of only the named fields on a new one. Either way `metadata` survives
-- every app write untouched. Every row starts with {}.
alter table event_series add column metadata jsonb not null default '{}'::jsonb;
alter table event_occurrence add column metadata jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- §7. Checklists — remove entirely.
-- ---------------------------------------------------------------------------

-- The attachment kind, the editor, the per-day ticks and the tables. With
-- occurrence status already gone (§3b) this removes the last notion of
-- completion from the app: an occurrence can no longer be marked done by any
-- means. RLS, indexes, 0011's replica identity and the 0006 / 0016 publication
-- membership go with the tables.
drop table occurrence_item_state, occurrence_item_removed, checklist_item cascade;

-- Its only referencing column (occurrence_item_state.status) went with the
-- table above. This is the last enum-as-table lookup in the schema — after it
-- there are none, and the only enumeration left anywhere is person.kind's check
-- constraint, which §10 takes.
drop table item_status;

-- ---------------------------------------------------------------------------
-- §6c. Vestigial columns — each written by exactly one path, read by none.
-- ---------------------------------------------------------------------------

-- Never read. `handle_new_user` (recreated below) stops writing it, which also
-- retires 0017's local-part fallback: the privacy problem that fix worked
-- around was the column existing at all.
alter table app_user drop column display_name;

-- Set to 'owner' once by create_account and never consulted — `is_account_member`
-- (0002) checks membership, not role. 0002's own note about tightening RLS with
-- it later is the only thing that ever wanted it.
alter table account_member drop column role;

-- Never written, by the app or by the reminder sender.
alter table notification_log drop column dismissed_at;

-- Never written. The reminder sender reads `user_preference.prefs.timezone`
-- instead, stamped per user by the app on startup.
alter table event_series drop column timezone;

-- Written on new-from-template, never read. The editor keeps its own
-- `templateId` state — it chooses whose people and reminders are copied into
-- the draft — but the stored provenance goes, and its index with it.
alter table event_series drop column template_id;

-- Set only by split_series, dropped above; never read. Its 0017 index goes too.
alter table event_series drop column split_from_id;

-- Always 'app', ignored by the sender; nothing ever sent `push` or `email`.
-- The column first, then the lookup it referenced.
alter table reminder drop column method;
drop table reminder_method;


-- ---------------------------------------------------------------------------
-- §6a. The dead roster model.
-- ---------------------------------------------------------------------------

-- 0005 replaced the original user-keyed roster with `person` / `event_person`,
-- and the original stayed behind. No app path and no sender path reads or
-- writes any of it; the only SQL that did was split_series, dropped above.
-- RLS policies and indexes go with the tables, and none is in the realtime
-- publication.
drop table event_participant, occurrence_participant_override,
           participation_requirement cascade;

-- Their lookups, once nothing references them.
drop table rsvp_status, participant_role;


-- ---------------------------------------------------------------------------
-- §6d. `person.color` holds a palette key — name it like event_series.color_key.
-- ---------------------------------------------------------------------------

-- It has held '1'-'12' since 0015 but kept its hex-era name from 0005.
alter table person rename column color to color_key;


-- ---------------------------------------------------------------------------
-- Functions recreated against the new schema.
-- ---------------------------------------------------------------------------

-- §6c: insert the id and nothing else. Runs from a trigger, so it needs no grant.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  insert into app_user (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

-- §6c: no `account_member.role`. §6d: `person.color_key`.
-- `create or replace` keeps the grant from 0003.
create or replace function create_account(p_name text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_account: not authenticated';
  end if;
  insert into account (name) values (p_name) returning id into v_id;
  insert into account_member (account_id, user_id) values (v_id, auth.uid());
  insert into person (account_id, user_id, name, color_key, kind, sort_order)
  values (v_id, auth.uid(), 'Me', '8', 'adult', 0);
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- §2/§7/§4. search_events, collapsed to a title search.
-- ---------------------------------------------------------------------------

-- With notes (§2) and checklists (§7) gone there is nothing left to aggregate,
-- so 0017's `docs` CTE collapses to a plain scan of `event_series`: both left
-- joins, the `string_agg`s, the `group by`, the `notes_text` aggregate and the
-- `snippet` column are all gone. Results are title + date.
--
-- Everything else is 0017's body unchanged: the same websearch_to_tsquery with
-- an escaped-ilike fallback applied to the title alone, the same ordering, the
-- same limit.
create function search_events(p_account uuid, p_query text)
returns table (
  series_id uuid,
  title     text,
  dtstart   timestamptz,
  all_day   boolean,
  rrule     text,
  rank      real
)
language sql stable
set search_path = public as $$
  with q as (
    select
      websearch_to_tsquery('english', p_query) as tsq,
      '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as likeq
  ),
  docs as (
    select
      s.id,
      s.title,
      s.dtstart,
      s.all_day,
      s.rrule,
      coalesce(s.title, '') as raw
    from event_series s
    where s.account_id = p_account
      and s.is_template = false
  )
  select
    d.id,
    d.title,
    d.dtstart,
    d.all_day,
    d.rrule,
    ts_rank(to_tsvector('english', d.raw), q.tsq) as rank
  from docs d, q
  where btrim(p_query) <> ''
    and (to_tsvector('english', d.raw) @@ q.tsq or d.raw ilike q.likeq)
  order by rank desc, d.dtstart desc nulls last
  limit 50;
$$;

-- 0017's `create or replace` inherited the grant from 0014. A plain `create`
-- after a `drop` does not, and the migration role's default privileges cover
-- tables and sequences only (0004) — not functions. Without this, search fails
-- with a permission error for every signed-in user.
grant execute on function search_events(uuid, text) to authenticated;
