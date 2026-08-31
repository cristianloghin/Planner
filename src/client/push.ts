/**
 * `push_subscription` rows — one per (user, browser) pair, keyed by the push
 * endpoint.
 *
 * Only the row writes live here. Asking for permission, subscribing through
 * `PushManager` and reading the browser's user agent all stay with the caller;
 * this module is handed the values and writes them.
 */
import { supabase } from './supabase'

/** The device registration to store, as taken from a browser push subscription. */
export interface PushSubscriptionRow {
  /** The push service URL. The row's primary key. */
  endpoint: string
  userId: string
  /** The subscription's `p256dh` key, base64url, as the sender needs it. */
  p256dh: string
  /** The subscription's `auth` secret, base64url. */
  auth: string
  /** Which browser this registration belongs to; null if unknown. */
  userAgent: string | null
}

/**
 * Register (or re-register) a device.
 *
 * Keyed on `endpoint`, so this is safe to repeat: the same browser re-running it
 * updates its row instead of adding a second one. That matters because the push
 * service can rotate an endpoint behind the app's back — the rotated-away row
 * stops working and gets pruned by the sender, and this write records the new one.
 *
 * `updated_at` is stamped on every write so a row's freshness is visible.
 */
export async function upsertPushSubscription(sub: PushSubscriptionRow): Promise<void> {
  const { error } = await supabase.from('push_subscription').upsert(
    {
      endpoint: sub.endpoint,
      user_id: sub.userId,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

/**
 * Drop one device's registration. The caller unsubscribes in the browser; this
 * removes the row so the sender stops trying to reach it.
 */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscription').delete().eq('endpoint', endpoint)
  if (error) throw error
}
