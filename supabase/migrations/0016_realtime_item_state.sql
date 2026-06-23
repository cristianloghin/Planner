-- ============================================================================
-- 0016_realtime_item_state.sql — make checklist ticks stream over Realtime.
--
-- Checklist ticks live in `occurrence_item_state` (toggled by the app's
-- `toggleChecklistEntry`). 0006 listed this table in the `supabase_realtime`
-- publication, yet in practice a partner never sees a tick appear live — they
-- have to reload — while its realtime twin `event_occurrence` (the same
-- account-scoped RLS via can_access_series(series_id), the same PK-based replica
-- identity) DOES push. A row written by one device is present and SELECTable for
-- the other (a reload shows it); only the live push is missing.
--
-- That gap can only come from the live publication not actually carrying this
-- table — the same drift 0008 had to patch for `occurrence_dependency`, and the
-- usual outcome of managing Realtime via the dashboard toggle out of band with
-- these migrations. Re-assert membership idempotently so it can't silently fall
-- back out. Guarded against the "table is already a member" error so it's a safe
-- no-op on a database where 0006 did take effect.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'occurrence_item_state'
  ) then
    alter publication supabase_realtime add table occurrence_item_state;
  end if;
end $$;
