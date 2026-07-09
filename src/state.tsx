import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './auth'
import { PageLoader } from './components/Spinner'
import { LoadFailedScreen, SyncBanners } from './components/SyncBanners'
import { completionsPrefix } from './data/completions'
import { queryClient } from './lib/queryClient'
import { useLatest } from './lib/useLatest'
import type { Action } from './store/actions'
import {
  enrichForQueue,
  isNetworkError,
  isPersistedAction,
  readQueue,
  readSnapshot,
  writeQueue,
  writeSnapshot,
} from './store/offline'
import { reducer } from './store/reducer'
import { type ScheduleStore, createStore, defaultState } from './store/store'
import type { AppState } from './types'

interface Ctx {
  state: AppState
  dispatch: (action: Action) => void
  /**
   * Bracket an in-progress edit (open editor) so a realtime reload doesn't pull
   * data out from under it. A deferred reload runs when the last edit ends.
   */
  beginEdit: () => void
  endEdit: () => void
}

const AppContext = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { accountId, session } = useAuth()

  // The store is created once. Mounted only when authed with an account (the
  // Root gate guarantees this), so it's the Supabase-backed store.
  const storeRef = useRef<ScheduleStore>()
  if (!storeRef.current) {
    storeRef.current =
      accountId && session ? createStore({ accountId, userId: session.user.id }) : createStore()
  }

  // State lives in useState; a ref mirrors it so the custom dispatch can compute
  // the next state synchronously (and pass it to the store) without a stale read.
  const [state, setState] = useState<AppState | null>(null)
  const stateRef = useRef<AppState | null>(null)

  // Bumped on every dispatch; a reload whose snapshot predates the latest
  // dispatch is stale and must not clobber newer optimistic state.
  const writeEpochRef = useRef(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  // ---- write queue --------------------------------------------------------
  // Writes drain in order through one pump, so dependent writes (create a
  // list, add its items) can never reach the server out of order. The queue
  // is persisted per account: a network failure leaves the action at the head
  // to retry (offline mode), a server rejection drops it and resyncs, and a
  // queue left over from a killed offline session replays on next launch.
  const pendingRef = useRef<Action[]>()
  if (!pendingRef.current) pendingRef.current = accountId ? readQueue(accountId) : []
  const [pendingCount, setPendingCount] = useState(pendingRef.current.length)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const pumpingRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const pump = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    let drained = 0
    let rejected = false
    try {
      while (pendingRef.current!.length) {
        const action = pendingRef.current![0]
        const st = stateRef.current
        if (!st) {
          // A queue with no state to replay against shouldn't exist (the
          // snapshot is written on every dispatch); don't wedge on it.
          console.warn('Dropping pending writes: no state to replay against')
          pendingRef.current = []
          if (accountId) writeQueue(accountId, [])
          setPendingCount(0)
          break
        }
        try {
          await storeRef.current!.apply(action, st)
        } catch (e) {
          if (isNetworkError(e)) {
            // Leave the action at the head; retry on 'online' or by timer
            // (flaky connections don't always flip navigator.onLine).
            setOffline(true)
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = setTimeout(() => void pumpRef.current(), 15_000)
            return
          }
          console.error('Server rejected a queued change; dropping it:', e)
          setSyncError('A change could not be saved — reloading from the server.')
          rejected = true
        }
        pendingRef.current = pendingRef.current!.slice(1)
        if (accountId) writeQueue(accountId, pendingRef.current!)
        setPendingCount(pendingRef.current!.length)
        drained += 1
      }
      setOffline(typeof navigator !== 'undefined' && !navigator.onLine)
    } finally {
      pumpingRef.current = false
    }
    // Reconcile once the backlog lands (reload skips while a queue exists).
    if (drained > 0 || rejected) scheduleReloadRef.current()
  }, [accountId])
  // Latest-pump mirror for the retry timer above, which outlives this render's
  // closure. (scheduleReloadRef below plays the same role for `pump` itself.)
  const pumpRef = useLatest(pump)

  const dispatch = useCallback(
    (action: Action) => {
      const prev = stateRef.current
      if (!prev) return
      const next = reducer(prev, action)
      stateRef.current = next
      setState(next)
      if (!isPersistedAction(action)) return
      writeEpochRef.current += 1
      if (accountId) writeSnapshot(accountId, next)
      pendingRef.current = [...pendingRef.current!, enrichForQueue(action, next)]
      if (accountId) writeQueue(accountId, pendingRef.current!)
      setPendingCount(pendingRef.current!.length)
      void pump()
    },
    [accountId, pump],
  )

  // ---- startup: paint the snapshot, replay leftovers, then load ----------
  const bootstrap = useCallback(async () => {
    setLoadFailed(false)
    try {
      // Replay writes left over from a previous (offline) session first, so
      // the load below already reflects them. Still offline → the queue stays
      // intact and the snapshot remains the UI until 'online' fires.
      await pump()
      if (pendingRef.current!.length) return
      const epoch = writeEpochRef.current
      const loaded = await storeRef.current!.load()
      // A dispatch raced the initial load: this snapshot predates it. Defer to
      // the normal reload path (which waits out the write queue) instead of
      // clobbering the optimistic state.
      if (writeEpochRef.current !== epoch) {
        scheduleReloadRef.current()
        return
      }
      const prev = stateRef.current
      const merged = prev
        ? { ...loaded, weekStart: prev.weekStart, selectedDay: prev.selectedDay }
        : loaded
      stateRef.current = merged
      setState(merged)
      if (accountId) writeSnapshot(accountId, merged)
      // Keep the per-user timezone stamp current — the server-side reminder
      // sender computes this user's wall-clock fire times from it.
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (deviceTz && merged.preferences.timezone !== deviceTz) {
        dispatch({ type: 'setTimezone', timezone: deviceTz })
      }
    } catch (e) {
      console.error('Initial load failed:', e)
      if (isNetworkError(e)) setOffline(true)
      // With a snapshot on screen the offline banner tells the story; with
      // nothing at all, show the retry screen instead of an eternal spinner.
      if (!stateRef.current) setLoadFailed(true)
    }
  }, [accountId, pump, dispatch])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only — accountId is fixed for this provider's lifetime (Root keys it)
  useEffect(() => {
    // Last-known data paints immediately — the fast path online, the only
    // path offline. weekStart/selectedDay re-derive from "today".
    const snap = accountId ? readSnapshot(accountId) : null
    if (snap && !stateRef.current) {
      const hydrated = { ...defaultState(), ...snap }
      stateRef.current = hydrated
      setState(hydrated)
    }
    void bootstrap()
  }, [])

  useEffect(() => {
    const onOnline = () => {
      setOffline(false)
      // Drain the backlog; if the initial load never succeeded, run it now.
      if (stateRef.current) void pump()
      else void bootstrap()
    }
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimeout(retryTimerRef.current)
    }
  }, [pump, bootstrap])

  // ---- realtime: reload on a partner's change ----------------------------
  // Edit guard: while an editor is open we defer reloads (the open form holds an
  // unsaved draft) and flush once it closes.
  const editCountRef = useRef(0)
  const pendingReloadRef = useRef(false)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const reloadFromStore = useCallback(async () => {
    try {
      for (;;) {
        // Unsent writes exist: a reload now would clobber their optimistic
        // rows. The pump reconciles once the queue drains.
        if (pendingRef.current!.length) return
        if (editCountRef.current > 0) {
          pendingReloadRef.current = true
          return
        }
        const epoch = writeEpochRef.current
        const fresh = await storeRef.current!.load()
        // The user acted while the load was in flight: this snapshot would
        // visibly revert their change (only to have it reappear on the next
        // echo). Throw it away and take a fresh one.
        if (writeEpochRef.current !== epoch) continue
        const prev = stateRef.current
        // weekStart/selectedDay are local UI navigation, not server data — keep
        // them so a remote change never yanks the user back to today's view.
        const merged = prev
          ? { ...fresh, weekStart: prev.weekStart, selectedDay: prev.selectedDay }
          : fresh
        stateRef.current = merged
        setState(merged)
        setSyncError(null)
        if (accountId) writeSnapshot(accountId, merged)
        return
      }
    } catch (e) {
      console.error('Reload from store failed:', e)
      if (isNetworkError(e)) setOffline(true)
    }
  }, [accountId])

  const scheduleReload = useCallback(() => {
    if (editCountRef.current > 0) {
      pendingReloadRef.current = true
      return
    }
    clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void reloadFromStore(), 300)
  }, [reloadFromStore])
  // Latest-scheduleReload mirror so `pump` and `bootstrap` (defined above it)
  // can trigger a reconcile without depending on it.
  const scheduleReloadRef = useLatest(scheduleReload)

  // Tables owned by the TanStack Query completions slice: their changes route
  // to targeted cache invalidation, not a full-state reload. Not deferred by
  // the edit guard — a partner's tick streaming into an open sheet is a
  // feature, and no form state derives from these rows.
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const invalidateCompletions = useCallback(() => {
    clearTimeout(invalidateTimerRef.current)
    invalidateTimerRef.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: completionsPrefix(accountId) })
    }, 200)
  }, [accountId])

  const onRemoteChange = useCallback(
    (table?: string) => {
      if (table === 'event_occurrence' || table === 'occurrence_item_state') {
        invalidateCompletions()
        return
      }
      if (table === undefined) {
        // Recovery after a dead channel (or an unknown source): anything may
        // have been missed, so refresh both worlds.
        invalidateCompletions()
      }
      scheduleReload()
    },
    [invalidateCompletions, scheduleReload],
  )

  const beginEdit = useCallback(() => {
    editCountRef.current += 1
  }, [])

  const endEdit = useCallback(() => {
    editCountRef.current = Math.max(0, editCountRef.current - 1)
    if (editCountRef.current === 0 && pendingReloadRef.current) {
      pendingReloadRef.current = false
      void reloadFromStore()
    }
  }, [reloadFromStore])

  useEffect(() => {
    const unsubscribe = storeRef.current!.subscribe(onRemoteChange)
    return () => {
      unsubscribe()
      clearTimeout(reloadTimerRef.current)
      clearTimeout(invalidateTimerRef.current)
    }
  }, [onRemoteChange])

  // The queue is nonzero for a moment on every online write; only surface it
  // once it has clearly stalled, so the banner doesn't flash on each tap.
  const [pendingStalled, setPendingStalled] = useState(false)
  useEffect(() => {
    if (pendingCount === 0) {
      setPendingStalled(false)
      return
    }
    const t = setTimeout(() => setPendingStalled(true), 1500)
    return () => clearTimeout(t)
  }, [pendingCount])

  const value = useMemo(
    () => (state ? { state, dispatch, beginEdit, endEdit } : null),
    [state, dispatch, beginEdit, endEdit],
  )
  // First launch with no snapshot and no network: offer a retry instead of an
  // eternal spinner.
  if (!value && loadFailed) {
    return <LoadFailedScreen offline={offline} onRetry={() => void bootstrap()} />
  }
  // Initial hydration: neither the snapshot nor the first load() is in yet.
  if (!value) return <PageLoader label="Loading your planner…" />

  return (
    <AppContext.Provider value={value}>
      {children}
      <SyncBanners
        offline={offline}
        pendingCount={pendingCount}
        pendingStalled={pendingStalled}
        syncError={syncError}
        onDismissError={() => setSyncError(null)}
      />
    </AppContext.Provider>
  )
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
