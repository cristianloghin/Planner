import { useMemo } from 'react'
import { useAuth } from '../auth'
import { SupabaseStore } from '../store/supabaseStore'

/** A store bound to the current account/user, or null until authed. Shared by
 *  the Query-owned slices (templates, completions), which reuse the store's
 *  row mappings instead of duplicating them. */
export function useAccountStore(): SupabaseStore | null {
  const { accountId, session } = useAuth()
  const userId = session?.user.id ?? null
  return useMemo(
    () => (accountId && userId ? new SupabaseStore(accountId, userId) : null),
    [accountId, userId],
  )
}
