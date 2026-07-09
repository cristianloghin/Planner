import { supabase } from './supabase'

/**
 * Web Push subscription plumbing (part 1 of notifications — registering the
 * device; the scheduled sender is a separate phase). One row of
 * `push_subscription` per (user, browser) pair, keyed by the push endpoint.
 *
 * iOS ground rules baked in here: the push APIs exist only inside an
 * installed (Home Screen) web app, permission must be requested from a user
 * gesture, and `userVisibleOnly` is mandatory.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** False until the deployment configures a VAPID key pair — the UI hides the
 *  whole notifications section rather than offer a toggle that can't work. */
export const pushConfigured = VAPID_PUBLIC_KEY.length > 0

export type PushSupport = 'ok' | 'needs-install' | 'unsupported'

/** Can this browser context subscribe at all — and if not, is installing the
 *  PWA the fix (iOS Safari) or is it simply unsupported? */
export function pushSupport(): PushSupport {
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return 'ok'
  // iPadOS reports itself as MacIntel; the touch check catches it.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  return isIOS && !standalone ? 'needs-install' : 'unsupported'
}

export function notificationPermission(): NotificationPermission | null {
  return 'Notification' in window ? Notification.permission : null
}

/** RFC 7515 base64url → the BufferSource pushManager.subscribe expects.
 *  Built over an explicit ArrayBuffer so TS's generic TypedArrays accept it
 *  as a BufferSource. */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration()
  // The worker registers on app start in production builds; its absence means
  // a dev server (or a first load that hasn't finished installing).
  if (!reg) throw new Error('Service worker not registered yet — try again in a moment.')
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * Ask permission (must be called from a user gesture) and register this
 * device. Reuses an existing browser subscription when present, so a retry
 * after a failed row write can't orphan one.
 */
export async function enablePush(userId: string): Promise<'subscribed' | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  const keys = sub.toJSON().keys
  if (!keys?.p256dh || !keys?.auth) throw new Error('Push subscription is missing its keys')
  const { error } = await supabase.from('push_subscription').upsert(
    {
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  return 'subscribed'
}

/**
 * Self-healing row sync, called on every app start: if this device holds a
 * live subscription (permission granted, previously enabled), re-upsert its
 * row. Covers push-service subscription ROTATION — the worker re-subscribes
 * (see src/sw.ts pushsubscriptionchange) but cannot write the DB row; the
 * stale row 404s and gets pruned by the sender, and this write registers the
 * fresh endpoint. Cheap and idempotent when nothing changed.
 */
export async function syncPushSubscription(userId: string): Promise<void> {
  try {
    if (!pushConfigured || notificationPermission() !== 'granted') return
    const sub = await currentSubscription()
    const keys = sub?.toJSON().keys
    if (!sub || !keys?.p256dh || !keys?.auth) return
    await supabase.from('push_subscription').upsert(
      {
        endpoint: sub.endpoint,
        user_id: userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  } catch (e) {
    // Best-effort: a failed sync self-heals on the next launch.
    console.warn('Push subscription sync failed:', e)
  }
}

/** Unsubscribe this device and drop its row. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  const { error } = await supabase.from('push_subscription').delete().eq('endpoint', endpoint)
  if (error) throw error
}
