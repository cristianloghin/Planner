-- ============================================================================
-- 0019_reminder_cron.sql — Web Push, part 2: scheduling the sender.
--
-- The send-reminders edge function (supabase/functions/send-reminders) is
-- invoked on a beat by pg_cron + pg_net. The function URL and bearer token
-- are project-specific, so this migration cannot schedule blindly — instead
-- it ships two owner-only helpers, called ONCE from the SQL editor after the
-- function is deployed (see docs/PUSH_NOTIFICATIONS.md):
--
--   select schedule_reminder_sender(
--     'https://<project-ref>.supabase.co/functions/v1/send-reminders',
--     '<service-role key>');
--   select unschedule_reminder_sender();  -- to stop
--
-- The bearer must be the service-role key: the function rejects anything
-- else, precisely so ordinary signed-in users can't trigger send sweeps.
-- Note pg_cron stores the command (token included) in cron.job, readable only
-- by superuser/owner roles — the same trust boundary as the key itself.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function schedule_reminder_sender(
  p_function_url text,
  p_bearer       text,
  p_schedule     text default '*/5 * * * *'
) returns void
language plpgsql security definer
set search_path = public as $$
begin
  -- Re-scheduling replaces any previous job (idempotent setup).
  if exists (select 1 from cron.job where jobname = 'send-reminders') then
    perform cron.unschedule('send-reminders');
  end if;
  perform cron.schedule(
    'send-reminders',
    p_schedule,
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)$job$,
      p_function_url, p_bearer
    )
  );
end;
$$;

create or replace function unschedule_reminder_sender()
returns void
language plpgsql security definer
set search_path = public as $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders') then
    perform cron.unschedule('send-reminders');
  end if;
end;
$$;

-- Owner-only: these embed a bearer token and control background jobs. 0004's
-- default privileges would otherwise grant execute to authenticated.
revoke execute on function schedule_reminder_sender(text, text, text) from public, anon, authenticated;
revoke execute on function unschedule_reminder_sender() from public, anon, authenticated;
