/**
 * Signing in, and knowing who is signed in.
 *
 * Only the Supabase calls live here. Holding onto the session, working out
 * which account it belongs to, and clearing cached data on the way out are all
 * the app's business — see ./account for the account lookup.
 */
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Named here so nothing above this folder has to import the Supabase package
// to talk about a session.
export type { Session } from '@supabase/supabase-js'

/**
 * The stored session, or null when nobody is signed in.
 *
 * A session that cannot be read — expired, or the network is down — comes back
 * as null, the same as being signed out. The app's response to both is the
 * same: show the sign-in screen.
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session ?? null
}

/**
 * Be told whenever the session changes: signing in or out, and a token being
 * renewed in the background.
 *
 * Returns a function that stops listening. It fires for every kind of change
 * without saying which — the session itself is what the app acts on.
 */
export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

/**
 * Sign in with an email and password.
 *
 * A wrong password is an ordinary outcome, not a failure to handle — it comes
 * back as a message to show on the form rather than as a thrown error. The same
 * goes for the other three below.
 */
export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? { error: error.message } : {}
}

/**
 * Create an account with an email and password.
 *
 * When the project requires confirming the email address, there is no session
 * until the link is clicked — `needsConfirmation` says so, and the app should
 * tell the user to go and check their inbox rather than waiting to be signed in.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ error?: string; needsConfirmation?: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }
  return { needsConfirmation: !data.session }
}

/**
 * Sign out.
 *
 * Clearing whatever the previous user left cached is the app's job and must
 * happen regardless, so a failure here is not raised — it would only stop that
 * clearing from running.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** Set a new password for the user who is already signed in. */
export async function updatePassword(password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { error: error.message } : {}
}
