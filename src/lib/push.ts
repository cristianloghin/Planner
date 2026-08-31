/**
 * @deprecated Split into services/push (the browser side) and client/push (the
 * rows), paired by domains/push.
 *
 * Kept so the settings screen and start-up keep working unchanged. Each of
 * these is now just the two halves called in order; delete once a route does
 * that itself.
 */
import { deletePushSubscription, upsertPushSubscription } from '../client/push'
import { readThisDevice, subscribeThisDevice, unsubscribeThisDevice } from '../services/push'

export {
  clearNotifications,
  currentSubscription,
  notificationPermission,
  pushConfigured,
  pushSupport,
  type PushSupport,
} from '../services/push'

export async function enablePush(userId: string): Promise<'subscribed' | 'denied'> {
  const device = await subscribeThisDevice()
  if (device === 'denied') return 'denied'
  await upsertPushSubscription({ ...device, userId })
  return 'subscribed'
}

/**
 * Called on every start-up: if this browser holds a live subscription, save it
 * again. Cheap when nothing changed, and it is what repairs an endpoint the
 * push service swapped behind our back.
 */
export async function syncPushSubscription(userId: string): Promise<void> {
  try {
    const device = await readThisDevice()
    if (device) await upsertPushSubscription({ ...device, userId })
  } catch (e) {
    // Best effort: a failed sync repairs itself on the next launch.
    console.warn('Push subscription sync failed:', e)
  }
}

export async function disablePush(): Promise<void> {
  const endpoint = await unsubscribeThisDevice()
  if (endpoint) await deletePushSubscription(endpoint)
}
