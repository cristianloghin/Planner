-- ============================================================================
-- 0004_grants.sql — base-table privileges for the `authenticated` role.
--
-- RLS (0002) decides WHICH ROWS a role may see, but Postgres first requires a
-- table-level GRANT for the role to touch the table at all. Tables created by
-- raw SQL migrations (rather than the Supabase dashboard) don't inherit the
-- default grants, so `authenticated` had no privileges and every query failed
-- with `42501 permission denied` before any policy was evaluated.
--
-- Granting full DML here is safe BECAUSE RLS is the real gate: a table with no
-- matching policy (e.g. the lookups, which only have a SELECT policy) still
-- rejects the un-permitted verbs. The app is authenticated-only, so `anon`
-- intentionally gets nothing beyond what GoTrue/auth needs.
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Cover any tables/sequences added by later migrations, too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
