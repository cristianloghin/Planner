/**
 * Which account a user works in.
 *
 * An account is the sharing boundary: every person, event and list belongs to
 * one, and RLS scopes every other read and write in this folder to the accounts
 * the signed-in user is a member of.
 */
import { supabase } from './supabase'

/**
 * The user's account, or null if they have none yet.
 *
 * Takes the first membership row. A user can belong to several accounts, but
 * the app works in one at a time and has no account switcher — the first row is
 * the active one.
 */
export async function findAccountId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('account_member')
    .select('account_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.account_id ?? null
}

/**
 * Create an account and return its id.
 *
 * The database function does three things in one transaction: it inserts the
 * account, makes the caller its owner, and adds a first person named "Me"
 * linked to their login (migration `0005`). So a new account is never empty and
 * the caller never has to follow up with more writes.
 *
 * It reads the signed-in user from the session and fails if there isn't one, so
 * only call it for a user who is already authenticated.
 *
 * Calling it twice creates two accounts — there is nothing on the database side
 * that makes it repeatable. The caller is responsible for only calling it once
 * per user.
 */
export async function createAccount(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_account', { p_name: name })
  if (error) throw error
  return data
}
