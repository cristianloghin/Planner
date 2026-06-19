-- ============================================================================
-- 0006_realtime.sql — broadcast calendar-data changes over Supabase Realtime.
--
-- Realtime only streams tables added to the `supabase_realtime` publication.
-- Add the tables the app's load() reads, so a change by one partner pushes to
-- the other's client. RLS still applies to realtime: each client only receives
-- changes for rows it may SELECT, so delivery is already account-scoped.
-- ============================================================================

alter publication supabase_realtime add table
  person,
  event_series,
  event_person,
  event_occurrence,
  occurrence_item_state,
  checklist_item,
  note,
  reminder;
