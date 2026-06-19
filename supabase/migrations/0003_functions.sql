-- ============================================================================
-- 0003_functions.sql — RPCs & triggers.
--   * handle_new_user  : mirror auth.users -> app_user on signup
--   * create_account   : create an account and add the caller as owner (atomic)
--   * split_series     : "edit this repeating event from here on"
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Mirror new auth users into app_user.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  insert into app_user (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Create an account + owner membership atomically. Avoids the chicken-and-egg
-- where a freshly-created account has no member and is invisible under RLS.
-- ----------------------------------------------------------------------------
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
  insert into account_member (account_id, user_id, role)
  values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$$;

-- ============================================================================
-- split_series — "Change this repeating event from here on."
--
-- WHAT IT DOES: ends the old repeat before a cutover and starts a fresh copy
-- from it, carrying EVERYTHING attached to the future dates onto the copy so
-- nothing is left pointing at the old series. One atomic transaction.
-- RETURNS the new series id — apply the user's edit to that one.
--
-- ── THE CONTRACT (read this) ────────────────────────────────────────────────
-- All RRULE math is the APP's job (the DB cannot expand a rule). The caller
-- computes, with its calendar library, and passes in:
--
--   p_series           the repeating series being edited
--   p_cutover          the cutover instant. THIS MUST BE A GENUINE
--                      occurrence_start of p_series — the first occurrence that
--                      moves to the new copy. NEVER raw now(): the new series is
--                      anchored here, so if it isn't a real slot the future rows
--                      (which keep their original occurrence_start) won't land
--                      on the new series' grid and you re-orphan them AND
--                      silently reschedule the event.
--   p_truncated_rrule  the OLD series' rule, trimmed to stop before p_cutover
--                      (UNTIL-bounded). The NEW series reuses the original rule
--                      verbatim, which is correct ONLY because COUNT is banned
--                      in storage (UNTIL is absolute; COUNT would restart).
--
-- Rescued future rows: reschedule/cancel/status, one-off items, removed-item
-- tombstones, checkmarks, participant overrides, sent-notification records,
-- and dependency links on BOTH ends.
-- ============================================================================
create or replace function split_series(
  p_series          uuid,
  p_cutover         timestamptz,
  p_truncated_rrule text
) returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_new   uuid;
  v_tmpl  boolean;
  v_rrule text;
  v_acct  uuid;
begin
  -- ---- guards ----
  select is_template, rrule, account_id into v_tmpl, v_rrule, v_acct
  from event_series where id = p_series;

  if not found then
    raise exception 'split_series: series % does not exist', p_series;
  end if;
  if not is_account_member(v_acct) then
    raise exception 'split_series: not authorized for series %', p_series;
  end if;
  if v_tmpl then
    raise exception 'split_series: cannot split a template (%)', p_series;
  end if;
  if v_rrule is null then
    raise exception 'split_series: series % does not repeat, nothing to split', p_series;
  end if;

  -- ---- 1. clone the series row, anchored at the cutover slot ----
  insert into event_series (account_id, title, all_day, dtstart, duration, rrule,
                            timezone, is_template, template_id, split_from_id,
                            default_status, created_by, created_at, updated_at)
  select account_id, title, all_day, p_cutover, duration, rrule,
         timezone, false, template_id, p_series,
         default_status, created_by, now(), now()
  from event_series where id = p_series
  returning id into v_new;

  -- ---- 2. copy the LIST checklist items (occurrence_start null) with fresh
  --         ids; keep old->new map so future ticks/tombstones can be retargeted.
  drop table if exists _item_map;
  create temp table _item_map (old_id uuid, new_id uuid) on commit drop;

  with src as (
    select id as old_id, gen_random_uuid() as new_id,
           group_label, label, required, sort_order
    from checklist_item
    where owner_series_id = p_series and occurrence_start is null
  ), ins as (
    insert into checklist_item (id, owner_series_id, occurrence_start,
                                group_label, label, required, sort_order)
    select new_id, v_new, null, group_label, label, required, sort_order from src
    returning 1
  )
  insert into _item_map select old_id, new_id from src;

  -- ---- 3. copy the other series-level attachments (current definitions) ----
  insert into event_participant (series_id, user_id, role, rsvp, invited_by)
  select v_new, user_id, role, rsvp, invited_by
  from event_participant where series_id = p_series;

  insert into reminder (series_id, user_id, offset_seconds, method)
  select v_new, user_id, offset_seconds, method
  from reminder where series_id = p_series;

  insert into participation_requirement (series_id, role, min_count)
  select v_new, role, min_count
  from participation_requirement where series_id = p_series;

  insert into note (owner_series_id, author_id, body, metadata)
  select v_new, author_id, body, metadata
  from note where owner_series_id = p_series;

  -- ---- 4. carry FUTURE per-date rows (occurrence_start >= cutover) to the copy.
  --         These are exactly the rows that would otherwise orphan. ----

  -- 4a. reschedule / cancel / whole-occurrence status
  update event_occurrence set series_id = v_new
   where series_id = p_series and occurrence_start >= p_cutover;

  -- 4b. one-off items added to a specific future occurrence (ids unchanged)
  update checklist_item set owner_series_id = v_new
   where owner_series_id = p_series and occurrence_start >= p_cutover;

  -- 4c. removed-item tombstones hide LIST items -> retarget to the copied items
  update occurrence_item_removed r
     set series_id = v_new, item_id = m.new_id
    from _item_map m
   where r.series_id = p_series and r.occurrence_start >= p_cutover
     and r.item_id = m.old_id;

  -- 4d. checkmarks on LIST items -> retarget BOTH series and item
  update occurrence_item_state s
     set series_id = v_new, item_id = m.new_id
    from _item_map m
   where s.series_id = p_series and s.occurrence_start >= p_cutover
     and s.item_id = m.old_id;

  -- 4e. checkmarks on one-off items (item id stays) -> retarget series only.
  --     Runs AFTER 4d, so rows 4d already moved no longer match here.
  update occurrence_item_state set series_id = v_new
   where series_id = p_series and occurrence_start >= p_cutover;

  -- 4f. participant changes for future occurrences
  update occurrence_participant_override set series_id = v_new
   where series_id = p_series and occurrence_start >= p_cutover;

  -- 4g. already-sent notification records (preserve dedup / dismiss history)
  update notification_log set series_id = v_new
   where series_id = p_series and occurrence_start >= p_cutover;

  -- 4h. dependency links — this series may sit on EITHER end of an edge
  update occurrence_dependency set dependent_series = v_new
   where dependent_series = p_series and dependent_occurrence >= p_cutover;
  update occurrence_dependency set prerequisite_series = v_new
   where prerequisite_series = p_series and prerequisite_occurrence >= p_cutover;

  -- ---- 5. stop the old series before the cutover ----
  update event_series set rrule = p_truncated_rrule, updated_at = now()
   where id = p_series;

  return v_new;
end;
$$;

-- ---- grants ----
grant execute on function create_account(text)             to authenticated;
grant execute on function split_series(uuid, timestamptz, text) to authenticated;
