-- ============================================================================
-- 0014_search.sql — account-scoped full-text search RPCs.
--
-- Two read-only functions the client calls per view: the Week calendar searches
-- events, the Lists view searches to-dos. Both are SECURITY INVOKER (the default
-- for `language sql`), so the SAME RLS that gates every other read applies here —
-- a non-member querying someone else's `p_account` simply gets zero rows, no
-- explicit membership guard needed.
--
-- Matching is Postgres FTS (`to_tsvector`/`@@`/`ts_rank`) with an ILIKE fallback
-- so a partial word ("foot" → "football"), which FTS lexemes won't catch, still
-- matches. No GIN indexes yet: at a household's data volume a seq-scan is instant;
-- add expression indexes here if a series/list ever grows large enough to need it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- search_events — match across an event's title, its notes, and its checklist
-- labels. Only real events (is_template = false); the document is assembled from
-- the series-level children (checklist list-items, occurrence_start null), so a
-- one-off item added to a single occurrence doesn't leak into the series match.
-- ----------------------------------------------------------------------------
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
      '%' || p_query || '%'                     as likeq
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

-- ----------------------------------------------------------------------------
-- search_list_items — match a to-do's title and its in-list group header.
-- Returns enough for the Lists view to jump to and highlight the row.
-- ----------------------------------------------------------------------------
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
      '%' || p_query || '%'                     as likeq
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

-- ---- grants (explicit, mirroring 0003; don't rely on PUBLIC default execute) --
grant execute on function search_events(uuid, text)      to authenticated;
grant execute on function search_list_items(uuid, text)  to authenticated;
