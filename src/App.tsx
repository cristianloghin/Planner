import { Link, type RoutePath, AppProvider as RouterProvider, RouterView } from '@mikrostack/router'
import { ListChecks, type LucideIcon, Settings as SettingsIcon } from 'lucide-react'
import { useEffect } from 'react'
import s from './App.module.css'
import { PageLoader } from './assets/ui/Spinner'
import { useAuth } from './auth'
import { AlertHost } from './components/AlertHost'
import { Login } from './components/Login'
import { clearNotifications, syncPushSubscription } from './lib/push'
import { routes } from './routes/routes'
import { AppProvider } from './state'

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

  // Spinner while the session resolves, or while the account bootstraps (the
  // store is built from accountId, so wait for it before mounting the data layer).
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
    // The router sits *above* the data layer: AppProvider is keyed by account
    // and remounts if that identity changes, and the URL should outlive that.
    // basePath comes from Vite's `base` so the two cannot drift.
    <RouterProvider
      routes={routes}
      config={{ basePath: import.meta.env.BASE_URL, defaultLoading: <PageLoader /> }}
    >
      {/* Key the data layer by account: the store captures accountId at mount, so
          if it ever changes (account switch, delayed bootstrap race) the provider
          must remount with a fresh store rather than keep writing to the old one. */}
      <AppProvider key={accountId}>
        <AppShell />
      </AppProvider>
    </RouterProvider>
  )
}

/** The app chrome around whichever route is showing: alerts and the tab bar. */
function AppShell() {
  const { session } = useAuth()

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
