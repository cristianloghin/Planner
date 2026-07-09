import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { queryClient } from './lib/queryClient'
import { clearSnapshot } from './store/offline'

interface AuthCtx {
  session: Session | null
  /** The active account the user operates in. Bootstrapped on first sign-in. */
  accountId: string | null
  /** True until the initial session check + account bootstrap settle. */
  loading: boolean
  signIn(email: string, password: string): Promise<{ error?: string }>
  signUp(email: string, password: string): Promise<{ error?: string; needsConfirmation?: boolean }>
  signOut(): Promise<void>
  /** Set a new password for the signed-in user. */
  updatePassword(password: string): Promise<{ error?: string }>
}

const AuthContext = createContext<AuthCtx | null>(null)

/**
 * In-flight bootstrap promises, keyed by user id. `getSession()`,
 * `onAuthStateChange` and StrictMode's double-mount can all kick off the
 * bootstrap at once; without this, two callers both seeing "no membership"
 * would each call `create_account` and create duplicate accounts. Sharing one
 * promise per user collapses them into a single attempt.
 */
const inFlight = new Map<string, Promise<string>>()

/**
 * Find the user's account, creating one the first time. A signed-in user with no
 * `account_member` row calls the `create_account` RPC once; the returned id is
 * the active account. (RLS scopes every series read/write to this account.)
 */
function ensureAccount(userId: string): Promise<string> {
  const existing = inFlight.get(userId)
  if (existing) return existing

  const run = (async () => {
    const { data, error } = await supabase
      .from('account_member')
      .select('account_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data.account_id

    const { data: newId, error: rpcError } = await supabase.rpc('create_account', { p_name: 'Home' })
    if (rpcError) throw rpcError
    return newId as string
  })()

  // Cache only the success; a failure should be retryable on the next sign-in.
  inFlight.set(userId, run)
  run.catch(() => inFlight.delete(userId))
  return run
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Monotonic call id: `resolve` runs concurrently (getSession + every auth
    // event), and a slow `ensureAccount` from an OLD session must not commit
    // its account after a newer resolve (sign-out, different user) has settled.
    let seq = 0

    // Resolve account membership for a session, then settle loading.
    async function resolve(next: Session | null) {
      if (cancelled) return
      const call = ++seq
      setSession(next)
      if (!next) {
        setAccountId(null)
        setLoading(false)
        return
      }
      try {
        const id = await ensureAccount(next.user.id)
        if (!cancelled && call === seq) setAccountId(id)
      } catch (e) {
        // Leave accountId null; the app can surface a retry. Don't trap the user
        // on a blank screen — let them at least reach a signed-in state.
        console.error('Account bootstrap failed:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void resolve(next)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      accountId,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error ? { error: error.message } : {}
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) return { error: error.message }
        // With email confirmation on, there's no session until the link is clicked.
        return { needsConfirmation: !data.session }
      },
      async signOut() {
        await supabase.auth.signOut()
        // Drop the previous account's cached data — the in-memory query cache
        // (whose persister mirrors the clear into storage) and the offline
        // state snapshot — so nothing readable lingers for the next sign-in.
        queryClient.clear()
        if (accountId) clearSnapshot(accountId)
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        return error ? { error: error.message } : {}
      },
    }),
    [session, accountId, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
