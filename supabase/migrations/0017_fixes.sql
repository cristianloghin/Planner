-- ============================================================================
-- 0017_fixes.sql — correctness & privacy fixes surfaced by a code review.
--
--   1. split_series: rescue `list_item_event_link` rows. The RPC moves every
--      other future per-occurrence row to the new series, but to-dos linked to
--      future occurrences were left pointing at the truncated old series, whose
--      capped rrule no longer renders those occurrences — the links vanished.
--   2. app_user privacy: signup stored the raw email in display_name (the
--      trigger's fallback) while the select policy was world-readable to any
--      authenticated user — any logged-in user could enumerate emails. Store
--      only the email's local part, scope reads to account-mates, and scrub
--      already-stored emails.
--   3. Index event_series(split_from_id): the only FK to event_series without
--      one; every series delete seq-scanned event_series for the FK check.
--   4. Search RPCs: escape ILIKE metacharacters in the fallback pattern, so
--      searching "%" or "_" no longer matches every row.
-- ============================================================================

-- ---- 1. split_series: carry linked to-dos to the new series -----------------
-- Identical to 0010 apart from the added step 4i.
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

  -- 4i. to-dos surfaced on future occurrences follow their occurrence (0009's
  --     list_item_event_link postdates the original RPC and was never rescued)
  update list_item_event_link set series_id = v_new
   where series_id = p_series and occurrence_start >= p_cutover;

  -- ---- 5. stop the old series before the cutover ----
  update event_series set rrule = p_truncated_rrule, updated_at = now()
   where id = p_series;

  return v_new;
end;
$$;

grant execute on function split_series(uuid, timestamptz, text) to authenticated;

-- ---- 2. app_user privacy ----------------------------------------------------

-- Signup fallback: the email's local part, never the full address.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  insert into app_user (id, display_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'display_name',
                   split_part(new.email, '@', 1),
                   ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Scrub full emails already stored by the old fallback.
update app_user
   set display_name = split_part(display_name, '@', 1)
 where display_name like '%@%';

-- Reads: yourself and your account-mates, not every user of the service.
drop policy if exists app_user_read on app_user;
create policy app_user_read on app_user for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from account_member m
      where m.user_id = app_user.id and is_account_member(m.account_id)
    )
  );

-- ---- 3. FK index ------------------------------------------------------------
create index if not exists event_series_split_from_id_idx
  on event_series (split_from_id);

-- ---- 4. escape ILIKE metacharacters in the search fallbacks ------------------
-- Only the `likeq` expression changes relative to 0014.
create or replace function search_events(p_account uuid, p_query text)
returns table (
  series_id uuid,
  title     text,
  dtstart   timestamptz,
  all_day   boolean,
  rrule     text,
  snippet   text,
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
      -- One combined text per series: title + every note body + every
      -- series-level checklist label. string_agg(distinct …) collapses the
      -- row-multiplication from the two left joins.
      coalesce(s.title, '') || ' ' ||
        coalesce(string_agg(distinct n.body, ' '), '') || ' ' ||
        coalesce(string_agg(distinct ci.label, ' '), '') as raw,
      coalesce(string_agg(distinct n.body, ' '), '')       as notes_text
    from event_series s
    left join note n           on n.owner_series_id = s.id
    left join checklist_item ci on ci.owner_series_id = s.id
                              and ci.occurrence_start is null
    where s.account_id = p_account
      and s.is_template = false
    group by s.id
  )
  select
    d.id,
    d.title,
    d.dtstart,
    d.all_day,
    d.rrule,
    nullif(left(d.notes_text, 140), '')         as snippet,
    ts_rank(to_tsvector('english', d.raw), q.tsq) as rank
  from docs d, q
  where btrim(p_query) <> ''
    and (to_tsvector('english', d.raw) @@ q.tsq or d.raw ilike q.likeq)
  order by rank desc, d.dtstart desc nulls last
  limit 50;
$$;

create or replace function search_list_items(p_account uuid, p_query text)
returns table (
  item_id     uuid,
  list_id     uuid,
  list_title  text,
  title       text,
  group_label text,
  done        boolean,
  due_on      date,
  person_id   uuid,
  rank        real
)
language sql stable
set search_path = public as $$
  with q as (
    select
      websearch_to_tsquery('english', p_query) as tsq,
      '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as likeq
  )
  select
    i.id,
    i.list_id,
    l.title,
    i.title,
    i.group_label,
    i.done,
    i.due_on,
    i.person_id,
    ts_rank(
      to_tsvector('english', coalesce(i.title, '') || ' ' || coalesce(i.group_label, '')),
      q.tsq
    ) as rank
  from list_item i
  join list l on l.id = i.list_id, q
  where l.account_id = p_account
    and btrim(p_query) <> ''
    and (
      to_tsvector('english', coalesce(i.title, '') || ' ' || coalesce(i.group_label, '')) @@ q.tsq
      or i.title ilike q.likeq
      or i.group_label ilike q.likeq
    )
  order by rank desc, i.done asc, i.sort_order asc
  limit 50;
$$;
