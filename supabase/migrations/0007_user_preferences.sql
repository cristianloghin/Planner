-- 0007_user_preferences.sql — per-user, per-account preferences (JSON blob).
--
-- WHY: preferences are personal — each member tailors their OWN view without
-- touching shared account data or their partner's view. The first preference is
-- per-person event-colour overrides (the seed `person.color` stays the shared
-- default; an override here only changes how THIS user sees that lane). Kept as a
-- single `jsonb` document per (account, user) so new scalar preferences (week
-- start, theme, …) are just new keys — no migration per setting.
--
-- Scoped per account (not globally per user) because preference values can
-- reference account-scoped ids (person ids in `personColors`). A user in two
-- accounts gets independent preferences in each.

create table user_preference (
  account_id uuid        not null references account(id)    on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  prefs      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

alter table user_preference enable row level security;

-- A user reads/writes only their OWN row, and only within an account they belong
-- to (mirrors the `reminder` policy: own-row + account membership).
create policy user_preference_rw on user_preference for all to authenticated
  using      (user_id = auth.uid() and is_account_member(account_id))
  with check (user_id = auth.uid() and is_account_member(account_id));

-- RLS filters rows; Postgres still needs the table-level grant (see 0004).
grant select, insert, update, delete on user_preference to authenticated;
