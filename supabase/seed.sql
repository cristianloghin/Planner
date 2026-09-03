-- ============================================================================
-- Local development data. Applied by `supabase db reset` / `supabase start`
-- after migrations 0001-0021, per [db.seed] in config.toml.
--
-- NEVER runs against a hosted project — the CLI only seeds a local database.
--
-- Sign in as:  dev@planner.test  /  password123
--
-- Everything uses fixed ids so a reset gives you the same account back and you
-- can reference rows from psql without looking them up.
-- ============================================================================

-- pgcrypto lives in `extensions` on Supabase but in `public` elsewhere; this
-- finds crypt()/gen_salt() either way.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- The login. Inserting into auth.users fires handle_new_user (0003), which
-- mirrors it into app_user — so that row is not created here.
--
-- email_confirmed_at is set so there is no confirmation step. To exercise THAT
-- path instead, sign up through the app and read the mail in Inbucket on :54324.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  -- GoTrue reads these as text, not null.
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'dev@planner.test',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'dev@planner.test'
  ),
  'email', now(), now(), now()
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The account. Not created through create_account(), because that reads
-- auth.uid() and there is no signed-in user here — so the membership and the
-- first person are written out by hand instead.
-- ---------------------------------------------------------------------------
insert into account (id, name)
values ('22222222-2222-4222-8222-222222222222', 'Home')
on conflict (id) do nothing;

insert into account_member (account_id, user_id)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111'
)
on conflict do nothing;

-- Two adults and a child, so supervision checks and the "Both" label have
-- something to work with. Colours are palette keys, not hex.
insert into person (id, account_id, user_id, name, color_key, kind, sort_order) values
  ('33333333-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Dev',  '1',  'adult', 0),
  ('33333333-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   null, 'Partner', '5',  'adult', 1),
  ('33333333-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   null, 'Kid',     '9',  'child', 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Events. Dates are relative to today, so a reset always lands data on screen
-- rather than in whatever month this file was written in.
--
-- `duration` is an interval and `rrule` is the bare rule with no RRULE: prefix
-- — the same as what the app writes. Never a COUNT rule (DATA_MODEL 2).
-- ---------------------------------------------------------------------------
insert into event_series
  (id, account_id, created_by, title, all_day, dtstart, duration, rrule, repeat_count,
   color_key, is_template)
values
  -- Weekly, timed, with a checklist: the case per-day ticks are about.
  ('44444444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Swimming', false,
   date_trunc('day', now()) + interval '16 hours', '60 minutes',
   'FREQ=WEEKLY;INTERVAL=1', null, '3', false),
  -- A one-off all-day, spanning two days.
  ('44444444-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Trip', true,
   date_trunc('day', now()) + interval '3 days', '2 days',
   null, null, '7', false),
  -- A child's event with no adult on it, so conflict detection has something
  -- to find.
  ('44444444-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Football practice', false,
   date_trunc('day', now()) + interval '1 day' + interval '17 hours', '90 minutes',
   'FREQ=WEEKLY;INTERVAL=1', null, null, false),
  -- A blueprint: a series with no date and no repeat (DATA_MODEL 10).
  ('44444444-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Dentist', false,
   null, '30 minutes', null, null, '11', true),
  -- Ends after a count: five lessons and no sixth (§8). The Month view should
  -- show exactly five.
  ('44444444-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Piano lesson', false,
   date_trunc('day', now()) + interval '2 days' + interval '15 hours', '45 minutes',
   'FREQ=WEEKLY;INTERVAL=1', 5, '5', false),
  -- Ends on a date: the other half of §8, as an UNTIL in the stored rule.
  ('44444444-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Eat a fish', false,
   date_trunc('day', now()) + interval '4 days' + interval '8 hours', '30 minutes',
   'FREQ=WEEKLY;INTERVAL=1;UNTIL=' ||
     to_char((date_trunc('day', now()) + interval '46 days')::date, 'YYYYMMDD') || 'T235959Z',
   null, '9', false)
on conflict (id) do nothing;

insert into event_person (series_id, person_id) values
  ('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001'),
  ('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003'),
  ('44444444-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000001'),
  ('44444444-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002'),
  ('44444444-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003'),
  ('44444444-0000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000003'),
  ('44444444-0000-4000-8000-000000000005', '33333333-0000-4000-8000-000000000003'),
  ('44444444-0000-4000-8000-000000000006', '33333333-0000-4000-8000-000000000002')
on conflict do nothing;

-- Half an hour before, as the app stores it: seconds, per user.
insert into reminder (id, series_id, user_id, offset_seconds) values
  ('77777777-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 1800)
on conflict (id) do nothing;

