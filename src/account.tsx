/**
 * Who is signed in and which account they work in, once both are known.
 *
 * Only mounted by the auth gate after the session has settled and the account
 * has been found or created, so everything below reads two ids that already
 * exist — no loading state, no I/O (R8). The account domain's query is what
 * does the finding; this just hands the answer down.
 */
import { type ReactNode, createContext, useContext, useMemo } from 'react'

export interface Account {
  accountId: string
  userId: string
  /** Absent on accounts created without one. */
  email: string | null
}

const AccountContext = createContext<Account | null>(null)

export function AccountProvider({ children, ...account }: Account & { children: ReactNode }) {
  const value = useMemo(
    () => ({ accountId: account.accountId, userId: account.userId, email: account.email }),
    [account.accountId, account.userId, account.email],
  )
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): Account {
  const account = useContext(AccountContext)
  if (!account) throw new Error('useAccount must be used within AccountProvider')
  return account
}
