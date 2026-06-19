-- ============================================================================
-- 0002_rls.sql — Row Level Security.
-- Model (DATA_MODEL.md Decision 1): the ACCOUNT is the only access boundary.
-- A user can read/write a row iff they are a member of its owning account.
-- event_participant is domain roster, NOT access control.
-- This is a deliberate baseline — tighten with account_member.role later if
-- owner-vs-member write rights become necessary.
-- ============================================================================

-- ---- helpers (SECURITY DEFINER so they bypass RLS while evaluating policies) ----
create or replace function is_account_member(p_account uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from account_member
    where account_id = p_account and user_id = auth.uid()
  );
$$;

create or replace function can_access_series(p_series uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from event_series s
    where s.id = p_series and is_account_member(s.account_id)
  );
$$;

-- ---- enable RLS everywhere ----
alter table app_user                       enable row level security;
alter table account                        enable row level security;
alter table account_member                 enable row level security;
alter table event_series                   enable row level security;
alter table event_occurrence               enable row level security;
alter table checklist_item                 enable row level security;
alter table occurrence_item_removed        enable row level security;
alter table occurrence_item_state          enable row level security;
alter table event_participant              enable row level security;
alter table occurrence_participant_override enable row level security;
alter table participation_requirement      enable row level security;
alter table reminder                       enable row level security;
alter table notification_log               enable row level security;
alter table note                           enable row level security;
alter table occurrence_dependency          enable row level security;

alter table item_status       enable row level security;
alter table occurrence_status enable row level security;
alter table rsvp_status       enable row level security;
alter table participant_role  enable row level security;
alter table reminder_method   enable row level security;

-- ---- lookups: world-readable to any authenticated user, no writes ----
create policy lookup_read on item_status       for select to authenticated using (true);
create policy lookup_read on occurrence_status for select to authenticated using (true);
create policy lookup_read on rsvp_status       for select to authenticated using (true);
create policy lookup_read on participant_role  for select to authenticated using (true);
create policy lookup_read on reminder_method   for select to authenticated using (true);

-- ---- identity ----
-- Display names aren't sensitive; readable by any authenticated user. A user
-- may only write their own row.
create policy app_user_read   on app_user for select to authenticated using (true);
create policy app_user_self   on app_user for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Accounts: visible to members. Create via create_account() RPC (0003), which
-- also inserts the membership; direct insert is allowed but you must add a
-- membership in the same transaction or you lock yourself out.
create policy account_member_read on account for select to authenticated
  using (is_account_member(id));
create policy account_write on account for all to authenticated
  using (is_account_member(id)) with check (is_account_member(id));
create policy account_insert on account for insert to authenticated with check (true);

-- Memberships: a user sees the rosters of accounts they belong to.
create policy account_member_read on account_member for select to authenticated
  using (is_account_member(account_id));
create policy account_member_write on account_member for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));

-- ---- series + everything hanging off it ----
create policy series_rw on event_series for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));

-- occurrence-grain + series-level children: gate by the owning series.
create policy occ_rw on event_occurrence for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy item_rw on checklist_item for all to authenticated
  using (can_access_series(owner_series_id)) with check (can_access_series(owner_series_id));

create policy item_removed_rw on occurrence_item_removed for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy item_state_rw on occurrence_item_state for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy participant_rw on event_participant for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy participant_override_rw on occurrence_participant_override for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy requirement_rw on participation_requirement for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

create policy note_rw on note for all to authenticated
  using (can_access_series(owner_series_id)) with check (can_access_series(owner_series_id));

-- reminders & their sent-log are per user, on a series you can access.
create policy reminder_rw on reminder for all to authenticated
  using (user_id = auth.uid() and can_access_series(series_id))
  with check (user_id = auth.uid() and can_access_series(series_id));

-- notification_log is written by the backend (service role bypasses RLS); a
-- user may read/dismiss their own rows.
create policy notification_self on notification_log for all to authenticated
  using (user_id = auth.uid() and can_access_series(series_id))
  with check (user_id = auth.uid() and can_access_series(series_id));

-- dependency edge: visible/editable if you can access either end.
create policy dependency_rw on occurrence_dependency for all to authenticated
  using (can_access_series(dependent_series) or can_access_series(prerequisite_series))
  with check (can_access_series(dependent_series) and can_access_series(prerequisite_series));
