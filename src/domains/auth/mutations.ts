/**
 * Signing in and out, and changing a password.
 *
 * Unlike every other domain, these are not registered as defaults and are not
 * kept for later. There is no sense in replaying a sign-in after a restart —
 * whoever pressed the button is not waiting any more, and the password they
 * typed should not be sitting in storage until then. So the behaviour lives in
 * the hook, where it disappears with the screen.
 *
 * Nothing here touches the cache. Clearing the previous user's data on the way
 * out is the app's job, not this domain's: it spans every other domain, and no
 * one of them should be reaching into the others.
 *
 * The session itself is not read here. Which account it belongs to is
 * domains/account.
 */
import { useMutation } from '@tanstack/react-query'
import { signIn, signOut, signUp, updatePassword } from '../../client/auth'

/**
 * The client reports a refused sign-in as a message rather than a failure,
 * because a wrong password is an ordinary thing to do. A screen wants it the
 * other way round — one place to read a problem from — so it becomes one here.
 */
function throwIfRefused(result: { error?: string }): void {
  if (result.error) throw new Error(result.error)
}

/** Sign in. A refused sign-in arrives as `error`, not as a result. */
export function useSignIn() {
  return useMutation<void, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      throwIfRefused(await signIn(email, password))
    },
  })
}

/**
 * Create an account.
 *
 * Succeeds with `needsConfirmation` when the project asks people to confirm
 * their email — there is no session until the link is opened, so the screen
 * should send them to their inbox rather than wait to be signed in.
 */
export function useSignUp() {
  return useMutation<{ needsConfirmation: boolean }, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const result = await signUp(email, password)
      throwIfRefused(result)
      return { needsConfirmation: result.needsConfirmation === true }
    },
  })
}

/**
 * Sign out.
 *
 * Never fails, so the app can get on with clearing the previous user's data
 * whatever the server said. See ../../client/auth for why.
 */
export function useSignOut() {
  return useMutation<void, Error, void>({ mutationFn: () => signOut() })
}

/** Set a new password for whoever is signed in. */
export function useUpdatePassword() {
  return useMutation<void, Error, { password: string }>({
    mutationFn: async ({ password }) => {
      throwIfRefused(await updatePassword(password))
    },
  })
}
