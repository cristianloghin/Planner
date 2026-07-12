-- ============================================================================
-- 0021_service_role_grants.sql — table privileges for the service role.
--
-- 0004 solved this exact problem for `authenticated`: tables created by raw
-- SQL migrations don't inherit the platform's default grants, so a role needs
-- explicit privileges before RLS is even consulted. What 0004 didn't cover is
-- `service_role` — nothing server-side touched these tables until the
-- send-reminders edge function's first authenticated run, which promptly
-- failed with `42501 permission denied for table push_subscription`.
--
-- Same shape as 0004: full DML now, plus default privileges so future
-- migration-created tables are covered too. `service_role` bypasses RLS by
-- design (that's its job); these grants are the layer *below* RLS.
-- ============================================================================

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
