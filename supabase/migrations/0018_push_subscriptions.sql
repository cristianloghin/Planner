-- ============================================================================
-- 0018_push_subscriptions.sql — Web Push, part 1: where devices register.
--
-- One row per (user, browser/device) push subscription, written by the client
-- after the user grants notification permission. The sender (a scheduled edge
-- function, next phase) reads these to deliver reminders while the app is
-- closed; `reminder_method` already has the 'push' code (0001).
--
-- The endpoint URL is the natural identity: it is unique per subscription and
-- what a sender must prune when the push service reports it gone (404/410).
-- Rows are strictly per-user (a device speaks for one signed-in user), so RLS
-- is a plain ownership check — not account membership.
-- ============================================================================

create table push_subscription (
  endpoint   text primary key,
  user_id    uuid not null references app_user(id) on delete cascade,
  -- Client public key + auth secret from PushSubscription.toJSON().keys,
  -- required to encrypt the payload for this device.
  p256dh     text not null,
  auth       text not null,
  -- Coarse device label so users can recognise stale registrations later.
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on push_subscription (user_id);

alter table push_subscription enable row level security;

-- Owner-only, all verbs. (Table-level DML grants come from 0004's default
-- privileges; the sender runs with the service role and bypasses RLS.)
create policy push_subscription_own on push_subscription
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
