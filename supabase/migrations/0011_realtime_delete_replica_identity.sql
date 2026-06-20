-- ============================================================================
-- 0011_realtime_delete_replica_identity.sql — make DELETEs sync over Realtime.
--
-- Realtime delivery is RLS-scoped (0006): each client only receives a change
-- for a row it may SELECT. For INSERT/UPDATE that works, because the WAL ships
-- the NEW row (all columns) and the SELECT policy can read account_id /
-- owner_series_id / list_id, etc.
--
-- For DELETE, Postgres only ships the OLD row's REPLICA IDENTITY, which defaults
-- to the PRIMARY KEY columns. On these tables the RLS-gating column is NOT part
-- of the primary key, so the policy sees it as NULL, the SELECT check fails, and
-- the DELETE event is filtered out — partners never see the row disappear until
-- a full reload. Tables whose gating column already lives in a composite PK
-- (event_occurrence, occurrence_item_state, occurrence_dependency, event_person)
-- aren't affected and are left as-is.
--
-- REPLICA IDENTITY FULL writes the entire old row to the WAL so the RLS check
-- can run on DELETE. Cost is a slightly larger WAL footprint on these tables.
-- ============================================================================

alter table event_series   replica identity full; -- events AND templates; gated by account_id
alter table person         replica identity full; -- gated by account_id
alter table checklist_item replica identity full; -- gated by owner_series_id
alter table note           replica identity full; -- gated by owner_series_id
alter table reminder       replica identity full; -- gated by series_id + user_id
alter table list           replica identity full; -- gated by account_id
alter table list_item      replica identity full; -- gated by list_id
