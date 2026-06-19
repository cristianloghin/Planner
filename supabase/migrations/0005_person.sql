-- ============================================================================
-- 0005_person.sql — people as DATA (one calendar lane per person).
--
-- WHY: the app draws one lane per person and must work for 3 or 3000 without
-- the frontend hardcoding anyone. The original model assumed every participant
-- is an auth user (`event_participant.user_id -> app_user`), but a person here
-- (e.g. a child) need not log in. So a `person` is an account-scoped row that
-- MAY link to a login but doesn't have to. `event_participant` (app_user + RSVP)
-- stays untouched for a future "invite a real user" feature; the app's roster
-- runs on `person` / `event_person`.
-- ============================================================================

create table person (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  user_id    uuid references app_user(id) on delete set null,  -- optional login link
  name       text not null,
  color      text not null default '#4f46e5',
  -- 'adult' | 'child': children get a narrow lane and need a free adult to
  -- supervise their events; an all-adults event is the merged "Both" block.
  -- This generalizes the old hardcoded parent/kid roles to any roster size.
  kind       text not null default 'adult' check (kind in ('adult', 'child')),
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index on person (account_id);
-- At most one person per login within an account (so "which lane is me" is unambiguous).
create unique index on person (account_id, user_id) where user_id is not null;

-- Who appears on an event = which lanes it spans. Series-grained roster.
create table event_person (
  series_id uuid not null references event_series(id) on delete cascade,
  person_id uuid not null references person(id)       on delete cascade,
  primary key (series_id, person_id)
);
create index on event_person (person_id);

-- ---- RLS: account-scoped, same model as everything else ----
alter table person       enable row level security;
alter table event_person enable row level security;

create policy person_rw on person for all to authenticated
  using (is_account_member(account_id)) with check (is_account_member(account_id));

create policy event_person_rw on event_person for all to authenticated
  using (can_access_series(series_id)) with check (can_access_series(series_id));

-- ---- grants (explicit; don't rely on 0004's default privileges) ----
grant select, insert, update, delete on person       to authenticated;
grant select, insert, update, delete on event_person to authenticated;

-- ---- bootstrap: give each new account its creator as the first person ----
-- Extends create_account (0003) so a fresh account always has at least one lane,
-- linked to the signed-in user. Extra people (a partner, a child) are added as
-- plain rows — directly in the DB or via the app.
create or replace function create_account(p_name text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_account: not authenticated';
  end if;
  insert into account (name) values (p_name) returning id into v_id;
  insert into account_member (account_id, user_id, role)
  values (v_id, auth.uid(), 'owner');
  insert into person (account_id, user_id, name, color, kind, sort_order)
  values (v_id, auth.uid(), 'Me', '#4f46e5', 'adult', 0);
  return v_id;
end;
$$;
