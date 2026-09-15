/**
 * Storing which devices should receive this user's reminders.
 *
 * The browser side — permission, subscribing, reading the keys back — is
 * services/push. This is only the storing, because a screen may not talk to the
 * database itself. A route asks the service for the device details, then hands
 * them here.
 *
 * These are not registered as durable writes and are not replayed after a
 * restart. A registration only means anything alongside a live subscription in
 * this browser, and there is already something better than a replay: every
 * start-up reads what the browser is subscribed as and saves it again, which
 * repairs a failed write and an endpoint the push service swapped underneath us
 * alike.
 */
import { useMutation } from '@tanstack/react-query'
import {
  type PushSubscriptionRow,
  deletePushSubscription,
  upsertPushSubscription,
} from '../../client/push'

export type { PushSubscriptionRow } from '../../client/push'

/**
 * Remember this device, or update what is remembered about it.
 *
 * Keyed on the endpoint, so repeating it is safe: the same browser updates its
 * own row rather than adding a second.
 */
export function useRegisterDevice() {
  return useMutation<void, Error, PushSubscriptionRow>({
    mutationFn: (row) => upsertPushSubscription(row),
  })
}

/** Forget a device, so the sender stops trying to reach it. */
export function useForgetDevice() {
  return useMutation<void, Error, { endpoint: string }>({
    mutationFn: ({ endpoint }) => deletePushSubscription(endpoint),
  })
}
