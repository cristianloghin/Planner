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
