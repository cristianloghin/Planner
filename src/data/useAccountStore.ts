import { useMemo } from 'react'
import { useAuth } from '../auth'
import { SupabaseStore } from '../store/supabaseStore'

/** A store bound to the current account/user, or null until authed. Used by the
 *  Query-owned slices that still reach their data through `SupabaseStore` rather
 *  than through `client/` — templates only, now that occurrence reads have moved.
 *  Deletes once the remaining slices have client functions of their own. */
export function useAccountStore(): SupabaseStore | null {
  const { accountId, session } = useAuth()
  const userId = session?.user.id ?? null
  return useMemo(
    () => (accountId && userId ? new SupabaseStore(accountId, userId) : null),
    [accountId, userId],
  )
}
