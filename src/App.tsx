import { Link, type RoutePath, AppProvider as RouterProvider, RouterView } from '@mikrostack/router'
import { onlineManager, useMutationState } from '@tanstack/react-query'
import { ListChecks, type LucideIcon, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import s from './App.module.css'
import { PageLoader } from './assets/ui/Spinner'
import { useAuth } from './auth'
import { subscribeToChanges } from './client/realtime'
import { AlertHost } from './components/AlertHost'
import { Login } from './components/Login'
import { SyncBanners } from './components/SyncBanners'
import { queryKeysForTable } from './domains'
import { usePreferencesWrite } from './domains/preferences/mutations'
import { withTimezone } from './domains/preferences/patches'
import { usePreferences } from './domains/preferences/queries'
import { clearNotifications, syncPushSubscription } from './lib/push'
import {
  dismissWriteError,
  getWriteError,
  queryClient,
  subscribeWriteError,
} from './lib/queryClient'
import { NavigationProvider } from './navigation'
import { routes } from './routes/routes'
import { startRealtime } from './services/realtime'

const TABS: { path: RoutePath; label: string; icon?: LucideIcon }[] = [
  { path: '/lists', label: 'Lists', icon: ListChecks },
  { path: '/day', label: 'Day' },
  { path: '/week', label: 'Week' },
  { path: '/month', label: 'Month' },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]

/**
 * Auth gate. Decides what to mount: a spinner while the session resolves, the
 * login screen when signed out, and the router + data layer + app only once
 * signed in.
 *
 * The gate stays imperative rather than becoming a route guard: a guard needs
 * a non-React `isAuthenticated()`, which means adopting `services/session`.
 * Mounting the router only inside the authed branch makes every route
 * authenticated by construction — a deep link visited while signed out shows
 * the login screen and still renders its route once the session lands.
 */
export function Root() {
  const { session, accountId, loading } = useAuth()

  // Spinner while the session resolves, or while the account bootstraps (every
  // query is keyed by accountId, so wait for it before mounting the app).
  if (loading || (session && !accountId)) {
    return (
      <div className={s.app}>
        <PageLoader />
      </div>
    )
  }

  if (!session) {
    return (
      <div className={s.app}>
        <Login />
      </div>
    )
  }

  return (
    // basePath comes from Vite's `base` so the two cannot drift.
    <RouterProvider
      routes={routes}
      config={{ basePath: import.meta.env.BASE_URL, defaultLoading: <PageLoader /> }}
    >
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </RouterProvider>
  )
}

/** The app chrome around whichever route is showing: alerts, sync status and the tab bar. */
function AppShell() {
  const { accountId, session } = useAuth()
  const userId = session?.user.id ?? null

  // ---- realtime: a partner's change refreshes what it touched ---------------
  // The client says which table changed, the service folds a burst into one
  // report, and the table map says which cached reads that makes stale. A
  // reconnection means changes were missed, so everything is refetched.
  useEffect(() => {
    if (!accountId) return
    const ids = { accountId, userId }
    return startRealtime({
      subscribe: subscribeToChanges,
      onChanged: ({ tables, missedSome }) => {
        if (missedSome) {
          void queryClient.invalidateQueries()
          return
        }
        for (const table of tables) {
          for (const queryKey of queryKeysForTable(table, ids)) {
            void queryClient.invalidateQueries({ queryKey })
          }
        }
      },
    })
  }, [accountId, userId])

  // ---- sync status, read straight off the query client -------------------
  const online = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  )
  // Writes paused for lack of network. Nonzero for a moment on every online
  // write too, so the pill only shows once the count has clearly stalled.
  const pendingCount = useMutationState({
    filters: { status: 'pending' },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length
  const [pendingStalled, setPendingStalled] = useState(false)
  useEffect(() => {
    if (pendingCount === 0) {
      setPendingStalled(false)
      return
    }
    const t = setTimeout(() => setPendingStalled(true), 1500)
    return () => clearTimeout(t)
  }, [pendingCount])
  const syncError = useSyncExternalStore(subscribeWriteError, getWriteError)

  // Keep the per-user timezone stamp current — the server-side reminder sender
  // computes this user's wall-clock fire times from it. Stamped once per zone
  // per session: a write that is rejected rolls the document back, and without
  // the guard that would re-trigger the effect and loop.
  const { data: prefs } = usePreferences(accountId, userId)
  const { mutate: savePrefs } = usePreferencesWrite()
  const stampedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!prefs || !accountId || !userId) return
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!deviceTz || prefs.timezone === deviceTz || stampedRef.current === deviceTz) return
    stampedRef.current = deviceTz
    savePrefs({ accountId, userId, prefs: withTimezone(prefs, deviceTz) })
  }, [prefs, accountId, userId, savePrefs])

  // Self-heal this device's push registration (the push service can rotate a
  // subscription behind our back; the worker re-subscribes, we re-record it).
  useEffect(() => {
    if (session) void syncPushSubscription(session.user.id)
  }, [session])

  // The app being in front means the reminders have been seen: clear the icon
  // badge and the notifications it counts. On mount for a cold launch (tapping
  // the badged icon), on visibilitychange for a resume from the app switcher —
  // iOS keeps the PWA alive in the background, so mount alone would miss it.
  useEffect(() => {
    const clear = () => {
      if (!document.hidden) void clearNotifications()
    }
    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])

  return (
    <div className={s.app}>
      <AlertHost />

      <main className={s.appMain}>
        <RouterView fallback={NotFound} />
      </main>

      <SyncBanners
        offline={!online}
        pendingCount={pendingCount}
        pendingStalled={pendingStalled}
        syncError={syncError}
        onDismissError={dismissWriteError}
      />

      <nav className={s.tabbar}>
        {TABS.map((t) => (
          <Link
            key={t.path}
            to={t.path}
            className={s.tab}
            activeClassName={s.active}
            aria-label={t.label}
          >
            {t.icon ? <t.icon size={20} /> : t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

/** Shown for a URL no route matches — a mistyped or stale deep link. */
function NotFound({ path }: { path: string }) {
  return (
    <div className={s.notFound}>
      <p>Nothing at {path}.</p>
      <Link to="/day" className={s.notFoundLink}>
        Go to today
      </Link>
    </div>
  )
}
