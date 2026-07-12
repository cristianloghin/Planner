/**
 * send-reminders — scheduled Web Push sender (phase 2 of notifications).
 *
 * Invoked every few minutes by pg_cron (see migration 0019 and
 * docs/PUSH_NOTIFICATIONS.md). Each run:
 *
 *   1. loads every registered device (push_subscription),
 *   2. per subscribed user, computes reminders due in the window since the
 *      last run — same recurrence semantics as the client, in the USER'S
 *      timezone (stamped into user_preference.prefs.timezone by the app),
 *   3. dedups against notification_log (its PK is exactly one reminder of one
 *      user for one occurrence), pushes to each of the user's devices, logs,
 *      and prunes subscriptions the push service reports gone (404/410).
 *
 * All date/recurrence/timezone math lives in ./logic.ts, which is pure and
 * covered by the vitest suite. This file is the Deno glue: env, queries,
 * VAPID crypto, delivery. It runs with the service role (bypasses RLS);
 * callers must present the CRON_SECRET in an `x-cron-secret` header —
 * verify_jwt alone would let ANY signed-in user trigger a send sweep, and
 * comparing the Authorization bearer against the runtime-injected
 * SUPABASE_SERVICE_ROLE_KEY proved brittle (legacy-JWT vs new sb_secret key
 * systems disagree about which form that env holds).
 *
 * Required secrets (supabase secrets set):
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — base64url pair from
 *     `npx web-push generate-vapid-keys` (public half = VITE_VAPID_PUBLIC_KEY)
 *   VAPID_SUBJECT — mailto: contact, e.g. mailto:you@example.com
 *   CRON_SECRET — any long random string (e.g. `openssl rand -base64 32`);
 *     the same value goes to schedule_reminder_sender (migration 0020)
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import {
  type SenderOverride,
  type SenderReminder,
  type SenderSeries,
  computeDueReminders,
} from './logic.ts'

// Window: cron fires every 5 minutes; a 15-minute lookback tolerates two
// missed beats, and notification_log absorbs the overlap.
const LOOKBACK_MS = 15 * 60_000
// Overrides worth fetching: occurrences within ±2 days of now cover every
// reminder offset the app offers (max 1 day) with margin.
const OVERRIDE_RANGE_MS = 2 * 86_400_000
const DEFAULT_TZ = 'UTC'

function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function bytesToB64u(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Import the raw base64url VAPID pair (web-push CLI format) as CryptoKeys. */
async function importVapidPair(publicB64u: string, privateB64u: string): Promise<CryptoKeyPair> {
  const point = b64uToBytes(publicB64u) // 65 bytes: 0x04 || x || y
  if (point.length !== 65 || point[0] !== 4) {
    throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 point')
  }
  const base = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64u(point.slice(1, 33)),
    y: bytesToB64u(point.slice(33, 65)),
    ext: true,
  }
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    base,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  )
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...base, d: privateB64u },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  )
  return { publicKey, privateKey }
}

/** Log the run's outcome (the response body isn't captured by the function
 *  log stream, so without this a healthy run looks like silence). */
function done(summary: Record<string, unknown>): Response {
  console.log('send-reminders:', JSON.stringify(summary))
  return Response.json(summary)
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('send-reminders: CRON_SECRET is not configured')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false },
  })

  // 1. Registered devices, grouped per user. No devices → nothing to do.
  const { data: subs, error: subErr } = await db
    .from('push_subscription')
    .select('endpoint, user_id, p256dh, auth')
  if (subErr) throw subErr
  if (!subs?.length) return done({ sent: 0, reason: 'no subscriptions' })

  const subsByUser = new Map<string, typeof subs>()
  for (const s of subs) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }
  const userIds = [...subsByUser.keys()]

  // 2. Users → accounts → series/reminders/overrides, plus per-user timezone.
  const [{ data: members, error: memErr }, { data: prefs, error: prefErr }] = await Promise.all([
    db.from('account_member').select('account_id, user_id').in('user_id', userIds),
    db.from('user_preference').select('user_id, prefs').in('user_id', userIds),
  ])
  if (memErr) throw memErr
  if (prefErr) throw prefErr

  const accountsByUser = new Map<string, string[]>()
  for (const m of members ?? []) {
    const arr = accountsByUser.get(m.user_id) ?? []
    arr.push(m.account_id)
    accountsByUser.set(m.user_id, arr)
  }
  const tzByUser = new Map<string, string>()
  for (const p of prefs ?? []) {
    const tz = (p.prefs as { timezone?: string } | null)?.timezone
    if (tz) tzByUser.set(p.user_id, tz)
  }

  const accountIds = [...new Set((members ?? []).map((m) => m.account_id))]
  if (!accountIds.length) return done({ sent: 0, reason: 'no accounts' })

  const nowMs = Date.now()
  const overrideFrom = new Date(nowMs - OVERRIDE_RANGE_MS).toISOString()
  const overrideTo = new Date(nowMs + OVERRIDE_RANGE_MS).toISOString()

  const { data: seriesRows, error: serErr } = await db
    .from('event_series')
    .select('id, title, all_day, dtstart, rrule, account_id')
    .in('account_id', accountIds)
    .eq('is_template', false)
    .not('dtstart', 'is', null)
  if (serErr) throw serErr
  const series = (seriesRows ?? []) as (SenderSeries & { account_id: string })[]
  const seriesIds = series.map((s) => s.id)
  if (!seriesIds.length) return done({ sent: 0, reason: 'no series' })

  const [{ data: remRows, error: remErr }, { data: ovrRows, error: ovrErr }] = await Promise.all([
    db
      .from('reminder')
      .select('id, series_id, user_id, offset_seconds')
      .in('user_id', userIds)
      .in('series_id', seriesIds),
    db
      .from('event_occurrence')
      .select('series_id, occurrence_start, rescheduled_to, cancelled')
      .in('series_id', seriesIds)
      .or(
        `and(occurrence_start.gte."${overrideFrom}",occurrence_start.lt."${overrideTo}"),and(rescheduled_to.gte."${overrideFrom}",rescheduled_to.lt."${overrideTo}")`,
      ),
  ])
  if (remErr) throw remErr
  if (ovrErr) throw ovrErr
  const reminders = (remRows ?? []) as SenderReminder[]
  const overrides = (ovrRows ?? []) as SenderOverride[]
  if (!reminders.length) return done({ sent: 0, reason: 'no reminders' })

  // 3. Compute due notifications per user, in that user's own timezone.
  const windowStartMs = nowMs - LOOKBACK_MS
  const due = userIds.flatMap((userId) => {
    const accounts = new Set(accountsByUser.get(userId) ?? [])
    if (!accounts.size) return []
    return computeDueReminders({
      series: series.filter((s) => accounts.has(s.account_id)),
      reminders: reminders.filter((r) => r.user_id === userId),
      overrides,
      timeZone: tzByUser.get(userId) ?? DEFAULT_TZ,
      windowStartMs,
      windowEndMs: nowMs,
    })
  })
  if (!due.length) return done({ sent: 0, reason: 'nothing due' })

  // 4. Dedup against notification_log.
  const { data: logRows, error: logErr } = await db
    .from('notification_log')
    .select('series_id, occurrence_start, user_id, reminder_id')
    .in('user_id', userIds)
    .in('series_id', [...new Set(due.map((d) => d.seriesId))])
  if (logErr) throw logErr
  const seen = new Set(
    (logRows ?? []).map(
      (l) =>
        `${l.series_id}:${new Date(l.occurrence_start).toISOString()}:${l.user_id}:${l.reminder_id}`,
    ),
  )
  const fresh = due.filter(
    (d) =>
      !seen.has(
        `${d.seriesId}:${new Date(d.occurrenceStart).toISOString()}:${d.userId}:${d.reminderId}`,
      ),
  )
  if (!fresh.length) return done({ sent: 0, reason: 'all already sent' })

  // 5. Deliver.
  const vapidKeys = await importVapidPair(
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:planner@example.com',
    vapidKeys,
  })

  let sent = 0
  const dead: string[] = []
  for (const d of fresh) {
    const targets = subsByUser.get(d.userId) ?? []
    let delivered = false
    for (const t of targets) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: t.endpoint,
          keys: { p256dh: t.p256dh, auth: t.auth },
        })
        await subscriber.pushTextMessage(
          JSON.stringify({ title: d.title, body: d.body, tag: d.tag, url: '/Planner/' }),
          {},
        )
        delivered = true
        sent += 1
      } catch (e) {
        const status = e instanceof webpush.PushMessageError ? e.response?.status : undefined
        if (status === 404 || status === 410) {
          dead.push(t.endpoint)
        } else {
          console.error(`push to ${t.endpoint.slice(0, 60)}… failed:`, e)
        }
      }
    }
    if (delivered) {
      // Log once per (occurrence, user, reminder) — the table's PK — so the
      // next overlapping window skips it. Ignore duplicate-key races.
      const { error: insErr } = await db.from('notification_log').insert({
        series_id: d.seriesId,
        occurrence_start: d.occurrenceStart,
        user_id: d.userId,
        reminder_id: d.reminderId,
      })
      if (insErr && insErr.code !== '23505') console.error('notification_log insert:', insErr)
    }
  }

  if (dead.length) {
    const { error: delErr } = await db.from('push_subscription').delete().in('endpoint', dead)
    if (delErr) console.error('pruning dead subscriptions:', delErr)
  }

  return done({ sent, due: fresh.length, deadSubscriptions: dead.length })
})
