# Push notifications — setup runbook

Reminders delivered as Web Push while the app is closed. Works on iPhone
(iOS 16.4+) **only from the installed Home Screen app**, and on any desktop or
Android browser with Web Push.

Two halves, shipped in two phases:

- **Registration** (client): the Settings → Notifications toggle subscribes the
  device and stores the subscription in `push_subscription` (migration 0018).
- **Delivery** (server): the `send-reminders` edge function computes due
  reminders — same recurrence semantics as the client, in each user's own
  timezone — and pushes them, deduping through `notification_log`. pg_cron
  invokes it every 5 minutes (migration 0019).

## One-time setup

### 1. Generate a VAPID key pair

```bash
npx web-push generate-vapid-keys
```

The **public key** is client-safe; the **private key** must only ever live in
function secrets.

### 2. Configure the client build

- GitHub → repo → Settings → Secrets and variables → Actions → **Variables**:
  add `VITE_VAPID_PUBLIC_KEY` = the public key. (Deploys pick it up via
  `deploy.yml`; without it the Notifications section doesn't render.)
- Local dev: add the same line to `.env.local`.

### 3. Configure the function secrets

```bash
supabase secrets set --project-ref <project-ref> \
  VAPID_PUBLIC_KEY='<public key>' \
  VAPID_PRIVATE_KEY='<private key>' \
  VAPID_SUBJECT='mailto:you@example.com'
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

### 4. Deploy and schedule

The function deploys from CI on every push to `main` (`deploy.yml`), or
manually:

```bash
supabase functions deploy send-reminders --project-ref <project-ref>
```

Then schedule it once, from the SQL editor (migration 0019 ships the helper;
the bearer must be the **service-role key** — the function rejects anything
else):

```sql
select schedule_reminder_sender(
  'https://<project-ref>.supabase.co/functions/v1/send-reminders',
  '<service-role key>');
```

To pause delivery: `select unschedule_reminder_sender();`

## Verifying

1. Install the PWA on the phone (Share → Add to Home Screen), open it, and
   flip Settings → Notifications on. A row should appear in
   `push_subscription`.
2. Create an event a few minutes out with an "At start" reminder; close the
   app. Within a cron beat of the fire time, the phone should show the push.
3. `select * from cron.job_run_details order by start_time desc limit 5;`
   shows the cron beats; the function's logs (Dashboard → Edge Functions)
   show each run's `{ sent, due, deadSubscriptions }` summary.

## How delivery decides what to send

- Every `reminder` row of a **subscribed** user is considered — reminders are
  per-user, so partner A's reminders never push to partner B's devices.
- Recurrence expansion mirrors the client exactly (the unit suite
  cross-validates `supabase/functions/send-reminders/logic.ts` against
  `src/lib/recurrence.ts`), including cancelled and rescheduled occurrences.
- Times are computed in the user's IANA timezone, which the app stamps into
  `user_preference.prefs.timezone` on every startup; a user with no stamp yet
  falls back to UTC.
- `notification_log`'s primary key (series, occurrence, user, reminder) is the
  dedup ledger: overlapping cron windows and retries can't double-send. The
  in-app banner (AlertHost) may still show alongside a push while the app is
  open — Apple requires every push to display, so the sender can't suppress
  one for foreground apps.
- Subscriptions the push service reports gone (404/410) are pruned.

## Known limits

- A user who never opened the app after this feature shipped has no timezone
  stamp → their fire times compute as UTC until they next open the app.
- The sender assumes the household shares the event creator's wall-clock
  intent; two partners in different timezones will each get pushes computed
  in their own zone (documented tradeoff, same as the calendar itself).
- iOS shows pushes only while the PWA is installed; removing it from the Home
  Screen silently kills the subscription until re-enabled.
