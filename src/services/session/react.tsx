/**
 * Reaching the session store from React.
 *
 * The store is put in place by whoever composes the app and reached through
 * these — not imported from anywhere, so every place that reads the session is
 * visible in the tree rather than hidden behind a global.
 */
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import type { SessionSnapshot, SessionSource, SessionStore, SignedInUser } from './store'
import { createSessionStore } from './store'

const SessionContext = createContext<SessionStore | null>(null)

/**
 * Holds one store for the life of the app and keeps it reading.
 *
 * The store is built once, lazily, and never rebuilt — so nothing below is
 * thrown away when the session changes, which is what happens if identity is
 * kept in a provider's state and the provider is re-keyed to change it.
 */
export function SessionProvider({
  source,
  children,
}: {
  source: SessionSource
  children: ReactNode
}) {
  const [store] = useState(() => createSessionStore(source))

  // `start` returns its own stop, so React mounting twice in development —
  // mount, unmount, mount — leaves exactly one subscription, not two. Getting
  // this wrong is what the duplicate-account bug in auth.tsx came from.
  useEffect(() => store.start(), [store])

  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>
}

function useSessionStore(): SessionStore {
  const store = useContext(SessionContext)
  if (!store) throw new Error('Session was read outside its provider')
  return store
}

/** The session as it stands, re-rendering when it changes. */
export function useSession(): SessionSnapshot {
  const store = useSessionStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/** Whoever is signed in, or null. */
export function useSignedInUser(): SignedInUser | null {
  return useSession().user
}

/**
 * The store itself, for handing to something that runs outside React — a write
 * being replayed, a callback from the service worker.
 */
export function useSessionAccessor(): () => SignedInUser | null {
  return useSessionStore().getUser
}
