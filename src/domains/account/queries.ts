/**
 * Which account this user works in.
 *
 * Nearly everything else is scoped by the account id, so this is the first
 * thing a signed-in app reads and the thing every other domain is handed.
 */
import { useQuery } from '@tanstack/react-query'
import { createAccount, findAccountId } from '../../client/account'

export const accountKey = (userId: string | null) => ['account', userId] as const

/** The name a first account is given. Users have no account switcher to rename it from yet. */
const FIRST_ACCOUNT_NAME = 'Home'

/**
 * This user's account, creating one the first time they sign in.
 *
 * Creating an account is not something that can be safely repeated — nothing in
 * the database stops a second call making a second account, with a second copy
 * of the user in it. What stops that here is the query itself: one request per
 * key, however many screens ask at once and however many times the app mounts
 * in development. This is why it is a query rather than a bare call.
 *
 * Never stale: an account id does not change while signed in.
 */
export function useAccountId(userId: string | null) {
  return useQuery({
    queryKey: accountKey(userId),
    queryFn: async () => {
      const existing = await findAccountId(userId as string)
      return existing ?? (await createAccount(FIRST_ACCOUNT_NAME))
    },
    enabled: userId != null,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
