/**
 * Who is signed in.
 *
 * Held here rather than read where it is needed, because two kinds of caller
 * want it and they want it differently: components want to re-render when it
 * changes, and code running outside React — a write replayed after a restart,
 * a worker callback — wants to ask for it once, synchronously.
 *
 * It is *fed* where the session comes from. This never talks to the network
 * itself, which is what lets it be driven by a stub in a test.
 */

/** The only two things the app ever needs about whoever is signed in. */
export interface SignedInUser {
  id: string
  /** Absent on accounts created without one. */
  email: string | null
}

export interface SessionSnapshot {
  /** Null when nobody is signed in — which is also what an unreadable session looks like. */
  user: SignedInUser | null
  /** True until the first read settles. Distinguishes "not yet known" from "signed out". */
  loading: boolean
}

/**
 * Where the session comes from. Satisfied by client/auth, wired in at start-up.
 *
 * The store cannot import the client itself, and should not: taking the source
 * as an argument is what makes it drivable from a test.
 */
export interface SessionSource {
  /** The session as it stands right now. */
  read(): Promise<SignedInUser | null>
  /** Be told when it changes. Returns a function that stops listening. */
  subscribe(onChange: (user: SignedInUser | null) => void): () => void
}

export interface SessionStore {
  /** Be told when the snapshot changes. Returns a function that stops listening. */
  subscribe(listener: () => void): () => void
  /** The current snapshot. Stable between changes, so React can compare it. */
  getSnapshot(): SessionSnapshot
  /**
   * Whoever is signed in, right now, without React. For code running outside a
   * component — the reason this is a store at all.
   */
  getUser(): SignedInUser | null
  /** Start reading and listening. Returns a function that stops. */
  start(): () => void
}

/**
 * A session store, not yet started.
 *
 * Create it once and keep it. Its identity never changes, so nothing below it
 * is thrown away when the person signing in does.
 */
export function createSessionStore(source: SessionSource): SessionStore {
  let snapshot: SessionSnapshot = { user: null, loading: true }
  const listeners = new Set<() => void>()

  /**
   * Replace the snapshot only when something actually differs. React compares
   * snapshots by identity, so handing back a fresh object for an unchanged
   * session would re-render everything on every token refresh.
   */
  function set(next: SessionSnapshot) {
    const same =
      snapshot.loading === next.loading &&
      snapshot.user?.id === next.user?.id &&
      snapshot.user?.email === next.user?.email
    if (same) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    getUser: () => snapshot.user,
    start() {
      let stopped = false

      // The first read and the first change can land in either order. Whichever
      // arrives second wins, and both clear `loading` — so a sign-in that beats
      // the initial read is not overwritten by it.
      void source
        .read()
        .then((user) => {
          if (!stopped) set({ user, loading: false })
        })
        .catch(() => {
          // An unreadable session is a signed-out one. The app shows the
          // sign-in screen either way, and holding `loading` forever would
          // leave it on a spinner.
          if (!stopped) set({ user: null, loading: false })
        })

      const unsubscribe = source.subscribe((user) => {
        if (!stopped) set({ user, loading: false })
      })

      return () => {
        stopped = true
        unsubscribe()
      }
    },
  }
}
