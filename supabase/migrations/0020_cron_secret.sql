-- ============================================================================
-- 0020_cron_secret.sql — decouple the sender's auth from Supabase API keys.
--
-- 0019's schedule_reminder_sender passed a bearer the function compared
-- against its injected SUPABASE_SERVICE_ROLE_KEY. That proved brittle on
-- projects using the new API key system (legacy JWTs vs sb_secret keys are
-- different strings, and which form the runtime injects is not observable),
-- so every beat 403'd even with a correct key.
--
-- New model — the one Supabase's own function settings recommend ("OFF with
-- JWT and custom auth logic in your function code"):
--   * the function's platform JWT check is disabled (config.toml sets
--     [functions.send-reminders] verify_jwt = false, applied on deploy);
--   * the function authenticates callers itself via a dedicated CRON_SECRET
--     carried in an `x-cron-secret` header (set the same value with
--     `supabase secrets set CRON_SECRET=...`);
--   * no Authorization bearer is needed anywhere.
--
-- Setup call becomes (see docs/PUSH_NOTIFICATIONS.md):
--   select schedule_reminder_sender(
--     'https://<project-ref>.supabase.co/functions/v1/send-reminders',
--     '<the CRON_SECRET value>');
-- ============================================================================

-- The signature changes, so drop 0019's version rather than overload it.
drop function if exists schedule_reminder_sender(text, text, text);

create or replace function schedule_reminder_sender(
  p_function_url text,
  p_cron_secret  text,
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
          'x-cron-secret', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)$job$,
      p_function_url, p_cron_secret
    )
  );
end;
$$;

-- Owner-only, same reasoning as 0019 (embeds a credential, controls jobs).
revoke execute on function schedule_reminder_sender(text, text, text) from public, anon, authenticated;
