-- ============================================================================
-- 0024_split_series.sql — cutting a series in two, atomically.
--
-- "Edit this and following" makes a new series that takes over from one day
-- and stops the old one the day before. That is one insert, one copy, one
-- update and one cap, and they have to land together: a series that was capped
-- but never copied has lost its future, and a copy whose source was never
-- capped shows every day twice. The app used to do these as separate writes;
-- this puts them in one transaction, where they belong.
--
-- Deliberately small. The old `split_series` (0003, 0010, 0017; dropped in 0022)
-- copied eight tables. Three things hang off a series now — its reminders, its
-- per-day rows, and nothing else — so this is the whole job:
--
--   1. insert the new series, from values the app worked out;
--   2. copy EVERY user's reminders onto it — the app can only see its own, so
--      this is the one step it could not do itself; the caller's copies are
--      then brought in line with the form by the app's usual reminder sync;
--   3. hand the old series' per-day rows from the cut day on to the new one;
--   4. cap the old series' rule.
--
-- Replayable. The new series' id is minted by the app and passed in, so a
-- write repeated after a lost response (a paused offline write, replayed on
-- reconnect) finds its series already there and does nothing but re-assert
-- the cap. Without that, a replay would copy the reminders a second time.
--
-- The recurrence maths stays in the app (DEV.md §3): the capped rule and the
-- new half's rule arrive here as strings, and the cut instant is the local
-- midnight the app's `dayRange` produces — matched by `>=`, so a per-day row
-- written at an older time of day moves too.
-- ============================================================================

create function split_series(
  p_series    uuid,          -- the series being cut
  p_new_id    uuid,          -- the new half's id, minted by the caller
  p_from      timestamptz,   -- first instant of the cut day (local midnight)
  p_old_rrule text,          -- the rule the old series is left with (capped)
  p_title     text,          -- the new half, field by field
  p_all_day   boolean,
  p_dtstart   timestamptz,
  p_duration  interval,
  p_attendees uuid[],
  p_rrule     text default null,   -- null: the new half is a one-off
  p_color_key text default null    -- null: drawn in its lane's colour
) returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_acct  uuid;
  v_tmpl  boolean;
  v_rrule text;
begin
  -- ---- guards ----
  select account_id, is_template, rrule into v_acct, v_tmpl, v_rrule
  from event_series where id = p_series;

  if not found then
    raise exception 'split_series: series % does not exist', p_series;
  end if;
  if not is_account_member(v_acct) then
    raise exception 'split_series: not a member of the account of series %', p_series;
  end if;
  if v_tmpl then
    raise exception 'split_series: % is a template and has no days to cut', p_series;
  end if;
  if v_rrule is null then
    raise exception 'split_series: % does not repeat, nothing to cut', p_series;
  end if;
  if p_dtstart is null then
    raise exception 'split_series: the new half needs a start';
  end if;

  -- ---- a replay: everything below already happened ----
  if exists (select 1 from event_series where id = p_new_id) then
    update event_series set rrule = p_old_rrule, updated_at = now()
     where id = p_series;
    return;
  end if;

  -- ---- 1. the new half, in the same account, made by whoever cut it ----
  insert into event_series
    (id, account_id, title, all_day, dtstart, duration, rrule, attendees,
     color_key, is_template, created_by)
  values
    (p_new_id, v_acct, p_title, p_all_day, p_dtstart, p_duration, p_rrule,
     p_attendees, p_color_key, false, auth.uid());

  -- ---- 2. everyone's reminders, with ids of their own ----
  insert into reminder (series_id, user_id, offset_seconds)
  select p_new_id, user_id, offset_seconds
    from reminder where series_id = p_series;

  -- ---- 3. the days from the cut on belong to the new half ----
  update event_occurrence set series_id = p_new_id
   where series_id = p_series and occurrence_start >= p_from;

  -- ---- 4. the old series stops before the cut ----
  update event_series set rrule = p_old_rrule, updated_at = now()
   where id = p_series;
end;
$$;

-- security definer: callable by signed-in users, and by nobody else.
revoke all on function split_series(uuid, uuid, timestamptz, text, text, boolean, timestamptz, interval, uuid[], text, text) from public;
grant execute on function split_series(uuid, uuid, timestamptz, text, text, boolean, timestamptz, interval, uuid[], text, text) to authenticated;
