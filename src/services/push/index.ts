/**
 * Getting this browser ready to receive reminders while the app is closed.
 *
 * Everything here is the browser side: asking permission, subscribing with the
 * push service, reading back what it gave us, and clearing what is on screen.
 * Storing the result is somebody else's job — this returns it and stops.
 *
 * Three rules of Apple's that shape all of it: the push APIs only exist inside
 * an app added to the Home Screen, permission must be asked for in response to
 * something the user did, and a subscription must promise to always show
 * something visible.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/**
 * False until a key pair is configured for the deployment. The settings screen
 * hides the whole section rather than offering a switch that cannot work.
 */
export const pushConfigured = VAPID_PUBLIC_KEY.length > 0

export type PushSupport = 'ok' | 'needs-install' | 'unsupported'

/**
 * Whether this browser can subscribe at all — and if not, whether adding the
 * app to the Home Screen would fix it, or nothing would.
 */
export function pushSupport(): PushSupport {
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return 'ok'
  // An iPad reports itself as a Mac; the touch count is what gives it away.
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

/**
 * What this browser needs stored so the sender can reach it.
 *
 * No user on it: this side does not know who is signed in. Whoever stores it
 * adds that.
 */
export interface DeviceRegistration {
  /** The push service URL that identifies this browser. */
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

/** The key format `pushManager.subscribe` wants, from the one we ship. */
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
  // Registered on start-up in a real build; missing means a dev server, or a
  // first load that has not finished installing yet.
  if (!reg) throw new Error('Service worker not registered yet — try again in a moment.')
  return reg
}

/** This browser's current subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

function toRegistration(sub: PushSubscription): DeviceRegistration | null {
  const keys = sub.toJSON().keys
  if (!keys?.p256dh || !keys?.auth) return null
  return {
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: navigator.userAgent,
  }
}

/**
 * Ask permission and subscribe this browser. Must be called from something the
 * user did.
 *
 * An existing subscription is reused, so trying again after a failed save
 * cannot leave a second one behind.
 */
export async function subscribeThisDevice(): Promise<DeviceRegistration | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  const device = toRegistration(sub)
  if (!device) throw new Error('Push subscription is missing its keys')
  return device
}

/**
 * What this browser is subscribed as right now, without asking for anything.
 *
 * For the check on every start-up: the push service can swap an endpoint behind
 * the app's back, and the worker resubscribes but cannot store the result.
 * Reading it here and saving it again is what repairs that.
 */
export async function readThisDevice(): Promise<DeviceRegistration | null> {
  if (!pushConfigured || notificationPermission() !== 'granted') return null
  const sub = await currentSubscription()
  return sub ? toRegistration(sub) : null
}

/** Unsubscribe this browser, returning the endpoint that should now be forgotten. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const { endpoint } = sub
  await sub.unsubscribe()
  return endpoint
}

/**
 * Opening the app means the reminders have been seen: clear the badge and close
 * what is still sitting in the notification centre.
 *
 * Both halves matter. The badge count is worked out FROM those notifications
 * (see src/sw.ts), so clearing the badge alone would leave the next push
 * counting ones already dealt with — the icon would come back reading three
 * when only one is new.
 *
 * Badges ride the same Apple rules as push, so this does nothing wherever push
 * does nothing.
 */
export async function clearNotifications(): Promise<void> {
  try {
    if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    for (const n of (await reg?.getNotifications()) ?? []) n.close()
  } catch (e) {
    // Decoration. Never surface it, never let it break start-up.
    console.warn('Clearing notifications failed:', e)
  }
}
