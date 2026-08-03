/// <reference lib="webworker" />
/**
 * Custom service worker (vite-plugin-pwa `injectManifest`). The generated-SW
 * mode covered precaching alone; Web Push needs `push`/`notificationclick`
 * handlers, which only a custom worker can carry. Everything the generated
 * worker did is reproduced here: precache + SPA navigation fallback +
 * prompt-mode updates.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA fallback: any in-scope navigation serves the precached index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Prompt-mode updates: UpdatePrompt posts SKIP_WAITING when the user accepts.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

/** The payload shape the (next-phase) sender delivers. Everything optional:
 *  a malformed or empty push still shows SOMETHING — iOS requires every push
 *  to display a notification, and repeated silent pushes get the subscription
 *  revoked. */
interface PushPayload {
  title?: string
  body?: string
  /** Notification collapse key, e.g. one per occurrence+offset (mirrors
   *  notification_log identity) so re-sends replace rather than stack. */
  tag?: string
  /** In-scope URL to open on tap. */
  url?: string
}

/**
 * Mirror the Home Screen icon badge onto the notifications still sitting in
 * Notification Center.
 *
 * The count is DERIVED rather than tallied: one the user swiped away outside
 * the app self-corrects on the next sync, and `tag` collapsing (one per
 * occurrence+offset) can't inflate it on a re-send. The app closes what's
 * outstanding when it opens, which is what keeps the derivation honest — see
 * clearNotifications in src/lib/push.ts.
 *
 * Badging rides the same iOS gate as Web Push (installed to the Home Screen,
 * permission granted), so it is never available where pushes aren't. Guarded
 * and swallowed regardless: a badge is decoration, and must never take the
 * delivery down with it.
 */
async function syncBadge(): Promise<void> {
  if (!('setAppBadge' in self.navigator)) return
  try {
    const open = await self.registration.getNotifications()
    if (open.length) await self.navigator.setAppBadge(open.length)
    else await self.navigator.clearAppBadge()
  } catch {
    // Badging unavailable or refused — the notification itself still stands.
  }
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() as PushPayload) ?? {}
  } catch {
    // Non-JSON payload: fall through to the defaults.
  }
  event.waitUntil(
    (async () => {
      // Awaited inside the chain, not handed to waitUntil directly: the badge
      // count comes from getNotifications(), so this one has to have landed
      // before we count or the push that triggered it goes uncounted.
      await self.registration.showNotification(payload.title ?? 'Planner', {
        body: payload.body ?? 'You have an upcoming plan.',
        tag: payload.tag,
        icon: 'pwa-192x192.png',
        data: { url: payload.url },
      })
      await syncBadge()
    })(),
  )
})

/** Fired when the push service rotates this device's subscription. The worker
 *  has no Supabase session, so it can't fix the DB row itself — it re-subscribes
 *  immediately (keeping a deliverable subscription alive) and the app upserts
 *  the row on its next open (syncPushSubscription in src/lib/push.ts). Until
 *  then, sends to the dead endpoint 404 and the sender prunes the old row. */
interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly oldSubscription: PushSubscription | null
  readonly newSubscription: PushSubscription | null
}

self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as PushSubscriptionChangeEvent
  e.waitUntil(
    (async () => {
      if (e.newSubscription) return // browser already re-subscribed
      const applicationServerKey = e.oldSubscription?.options.applicationServerKey
      if (!applicationServerKey) return
      await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url
  const target = url?.startsWith(self.registration.scope) ? url : self.registration.scope
  event.waitUntil(
    (async () => {
      // Focus an existing window when there is one; else open a fresh one.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (existing) {
        await existing.focus()
        if (url && 'navigate' in existing) await existing.navigate(target)
      } else {
        await self.clients.openWindow(target)
      }
      // Drop the tapped notification from the count. The app clears the badge
      // outright once it foregrounds; this covers the gap until it does, and
      // the case where it never gets there.
      await syncBadge()
    })(),
  )
})
