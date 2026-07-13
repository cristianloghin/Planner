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
  invokes it every 5 minutes (migrations 0019–0021: cron helpers, the
  CRON_SECRET auth model, and the `service_role` table grants it runs under).

## Redo-from-scratch checklist

The compressed version of everything below, in dependency order — for setting
up a fresh project or recovering from a rotation. Details in the sections
that follow.

1. `npx web-push generate-vapid-keys` → keep both halves somewhere safe.
2. GitHub repo → Settings → Secrets and variables → Actions → **Variables**
   (not Secrets!): `VITE_VAPID_PUBLIC_KEY` = the public key.
3. `supabase secrets set`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, and `CRON_SECRET` (a random string you invent —
   `openssl rand -base64 32` — and keep; Supabase won't show it again).
4. Make sure migrations are applied and the function deployed — a push to
   `main` (or re-running the Deploy workflow from the Actions tab) does both.
   The re-run is REQUIRED after step 2: the key is baked in at build time.
5. Schedule the beat once, in the SQL editor:
   `select schedule_reminder_sender('https://<ref>.supabase.co/functions/v1/send-reminders', '<CRON_SECRET>');`
6. Smoke-test without waiting:
   `curl -s -X POST <function url> -H "x-cron-secret: <CRON_SECRET>"` →
   expect `{"sent":0,"reason":"nothing due"}`.
7. Per device: installed PWA → Settings → Notifications toggle → allow.
8. Real test: event ~10 min out with an "At start" reminder, app closed,
   push arrives within a beat of the start time.

If any step misbehaves, jump to **Troubleshooting** below — every failure
signature listed there has actually happened.

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
  VAPID_SUBJECT='mailto:you@example.com' \
  CRON_SECRET="$(openssl rand -base64 32)"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

`CRON_SECRET` is how the scheduler authenticates to the function — keep the
generated value; you'll pass the same string to `schedule_reminder_sender`
below. (The function deliberately does NOT use Supabase API keys for this:
comparing bearers against the runtime-injected service key proved brittle
across the legacy-JWT and `sb_secret_...` key systems and 403'd spuriously.)

### 4. Deploy and schedule

The function deploys from CI on every push to `main` (`deploy.yml`), or
manually:

```bash
supabase functions deploy send-reminders --project-ref <project-ref>
```

The function does its own auth (the `x-cron-secret` header against
`CRON_SECRET`), and its platform "Verify JWT" check is disabled declaratively
(`supabase/config.toml`, applied on every CLI deploy) — Supabase's own
recommendation for scheduled functions. If the function was deployed before
that config existed, flip "Verify JWT with legacy secret" OFF once in
Dashboard → Edge Functions → send-reminders → Details, or just redeploy.

Then schedule it once, from the SQL editor (migration 0020 ships the helper);
the second argument is the `CRON_SECRET` value from step 3:

```sql
select schedule_reminder_sender(
  'https://<project-ref>.supabase.co/functions/v1/send-reminders',
  '<CRON_SECRET value>');
```

To pause delivery: `select unschedule_reminder_sender();`

You can exercise the function directly, without waiting for a beat:

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/send-reminders \
  -H "x-cron-secret: <CRON_SECRET value>"
# → {"sent":0,"reason":"nothing due"} on a healthy, quiet system
```

## Verifying

1. Install the PWA on the phone (Share → Add to Home Screen), open it, and
   flip Settings → Notifications on. A row should appear in
   `push_subscription`.
2. Create an event a few minutes out with an "At start" reminder; close the
   app. Within a cron beat of the fire time, the phone should show the push.
3. `select * from cron.job_run_details order by start_time desc limit 5;`
   shows the cron beats firing; each run also logs a
   `send-reminders: { sent, due, deadSubscriptions }` summary line
   (Dashboard → Edge Functions → Logs).
4. The definitive per-beat record is what the function RETURNED to pg_net:

   ```sql
   select status_code, content::text, created
   from net._http_response order by id desc limit 5;
   ```

   `200` + a summary body is healthy; `403 {"error":"forbidden"}` means the
   scheduled `x-cron-secret` doesn't match the function's `CRON_SECRET`
   (re-run `schedule_reminder_sender` with the right value); `500
   CRON_SECRET not configured` means step 3 was skipped.

## Troubleshooting

Field-tested failure signatures, in the order you're likely to meet them.
The general diagnosis trail is: `notification_log` (was it sent?) → the
function's Logs (what did the beat decide?) → `net._http_response` (what did
the beat return?) → `cron.job_run_details` (did the beat even fire?).

**The Notifications section doesn't appear in Settings.**
The build has no `VITE_VAPID_PUBLIC_KEY`. Almost always: the value was added
under the Actions **Secrets** tab instead of **Variables** (`deploy.yml`
reads `vars.`), or the deployed build predates the variable. Fix the tab,
re-run the Deploy workflow, hard-refresh / accept the update prompt.

**Edge Function logs show only `booted` / `shutdown`.**
Normal — that's the worker lifecycle. Healthy runs log one
`send-reminders: {...}` summary line; the per-beat response also lands in
`net._http_response` (see Verifying).

**Log warning: "Node.js 20 and below are deprecated… upgrade to Node.js 22".**
Cosmetic false positive. The function runs on Deno; supabase-js probes
`process.version` and Deno's Node-compat shim reports itself as Node 20.
There is no Node version to upgrade. Ignore.

**Every beat returns `403 {"error":"forbidden"}`.**
The scheduled `x-cron-secret` doesn't match the function's `CRON_SECRET`
secret — or the job was scheduled with the pre-0020 bearer-based helper.
Re-run `schedule_reminder_sender(url, cron_secret)` with the current value.
(Historical note: the original design compared the Authorization bearer to
the runtime-injected service key; that 403'd spuriously on new-API-key
projects and was replaced in migration 0020. Do not resurrect it.)

**`401` before the function's own code runs.**
The platform's "Verify JWT" check is still ON from a deploy that predates
`config.toml`'s `[functions.send-reminders] verify_jwt = false`. Redeploy the
function, or flip the toggle off once in Dashboard → Edge Functions →
send-reminders.

**`500 {"error":"CRON_SECRET not configured"}`.**
The function secret was never set (or was set after the last boot — secrets
apply on the next invocation). `supabase secrets set CRON_SECRET=...`.

**`42501 permission denied for table push_subscription` (or any table).**
The `service_role` grants are missing — migration 0021 ships them (0004 only
covered `authenticated`, and nothing server-side touched these tables before
the sender existed). `supabase db push`, or run 0021's GRANTs manually.

**Beat says `sent: 1` but no push on the phone.**
Check iOS Notification Center first (Focus/DND files banners silently). If
truly absent: the subscription may have rotated — open the app once (it
re-registers on launch) and watch `deadSubscriptions` in the next beats; a
`1` there means the stale endpoint was pruned and the fresh one takes over.

**Reminder arrived late.**
Up to one beat (~5 min) late is by design; the cron fires on the fives and
each beat has a 15-minute lookback, so missed beats deliver on the next one.
Tighter cadence: re-run the scheduler with a third argument, e.g.
`'*/2 * * * *'` (pg_cron minimum: every minute).

**Rotating the VAPID keys** invalidates every existing subscription: update
the GitHub variable + function secrets, redeploy/rebuild, then every device
must toggle notifications off and on again.

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
