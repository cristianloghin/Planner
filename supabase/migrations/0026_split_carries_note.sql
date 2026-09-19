-- ============================================================================
-- 0026_split_carries_note.sql — "this and following" carries the series' note.
--
-- 0024's split hands the new half the old series' reminders and per-day rows.
-- A series can now own a note (0025), and a note is part of what the series
-- *is* from the cut day on, so the new half gets a copy: a note row of its
-- own with the same body (docs/NOTE_MODEL.md, Decision 14). Row ids inside
-- the body stay the same, which is fine — the two are now two documents.
--
-- The copy's id is minted by the app and passed in, like the new series' own,
-- so the app can go on to write the note the user edited in the same form —
-- an update by id that lands after this, in the app's ordered write queue.
-- Without it the copy would have an id nobody outside this function knows.
--
-- Everything else is 0024's body unchanged. The replay guard covers the copy
-- too: a repeated call finds the new series and does nothing but re-cap.
-- ============================================================================

drop function split_series(uuid, uuid, timestamptz, text, text, boolean, timestamptz, interval, uuid[], text, text);

create function split_series(
  p_series    uuid,
  p_new_id    uuid,
  p_from      timestamptz,
  p_old_rrule text,
  p_title     text,
  p_all_day   boolean,
  p_dtstart   timestamptz,
  p_duration  interval,
  p_attendees uuid[],
  p_rrule     text default null,
  p_color_key text default null,
  p_note_id   uuid default null    -- the id the copied note gets, if there is one to copy
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

  -- ---- 3. the series' note, as a note of the new half's own ----
  -- The author stays who wrote it; the copy is not a new piece of writing.
  insert into note (id, account_id, owner_series_id, title, author_id, body, metadata)
  select coalesce(p_note_id, gen_random_uuid()), account_id, p_new_id, title, author_id, body, metadata
    from note where owner_series_id = p_series;

  -- ---- 4. the days from the cut on belong to the new half ----
  update event_occurrence set series_id = p_new_id
   where series_id = p_series and occurrence_start >= p_from;

  -- ---- 5. the old series stops before the cut ----
  update event_series set rrule = p_old_rrule, updated_at = now()
   where id = p_series;
end;
$$;

-- A new signature is a new function to the grant system (0024's grant named
-- the old argument list), so it is granted again here.
revoke all on function split_series(uuid, uuid, timestamptz, text, text, boolean, timestamptz, interval, uuid[], text, text, uuid) from public;
grant execute on function split_series(uuid, uuid, timestamptz, text, text, boolean, timestamptz, interval, uuid[], text, text, uuid) to authenticated;
