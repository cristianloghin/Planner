-- 0010_occurrence_overrides.sql
--
-- Wires up the two recurring-event editing scopes the schema was designed for but
-- the app never used:
--
--   * "this occurrence"     -> a one-off timing override. The slot identity stays
--     `event_occurrence.occurrence_start`; the new start goes in `rescheduled_to`
--     and the new length in the column added here, `rescheduled_duration`.
--   * "this and following"  -> `split_series` (already defined in 0003). That RPC
--     predates the person refactor (0005) and still copies the legacy
--     `event_participant` table, so a split produced a new series with NO
--     attendees. This migration re-creates it copying `event_person` as well.
--
-- `event_occurrence` is already in the realtime publication (0006), so the new
-- column ships to clients with no extra publication change.

-- ---- 1. per-occurrence duration override -------------------------------------
alter table event_occurrence add column rescheduled_duration interval;

-- ---- 2. fix split_series to carry attendees (event_person) -------------------
-- Identical to 0003 apart from the one added insert in step 3.
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
  -- Attendees live in event_person (0005); copy them so the new series keeps its
  -- roster. The legacy event_participant copy below is a no-op on current data
  -- but kept for any rows that predate the person refactor.
  insert into event_person (series_id, person_id)
  select v_new, person_id
  from event_person where series_id = p_series;

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

grant execute on function split_series(uuid, timestamptz, text) to authenticated;
