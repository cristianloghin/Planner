import { useState } from 'react'
import { WeekCalendar } from './components/WeekCalendar'
import { DayView } from './components/DayView'
import { MonthView } from './components/MonthView'
import { Lists } from './components/Lists'
import { Settings } from './components/Settings'
import { AlertHost } from './components/AlertHost'
import { Login } from './components/Login'
import { mondayOf, weekdayIndex } from './lib/dates'
import { cx } from './lib/cx'
import { AppProvider, useApp } from './state'
import { useAuth } from './auth'
import s from './App.module.css'

type Tab = 'day' | 'calendar' | 'month' | 'lists' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'calendar', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'lists', label: 'Lists' },
  { id: 'settings', label: 'People' },
]

/**
 * Auth gate. Decides what to mount: a spinner while the session resolves, the
 * login screen when signed out, and the data layer + app only once signed in.
 * The data store (AppProvider) is mounted *inside* the authed branch so it never
 * loads for a signed-out user.
 */
export function Root() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className={s.app} />
  }

  if (!session) {
    return (
      <div className={s.app}>
        <Login />
      </div>
    )
  }

  return (
    <AppProvider>
      <App />
    </AppProvider>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>('day')
  const { dispatch } = useApp()

  function openDay(iso: string) {
    dispatch({ type: 'setWeek', weekStart: mondayOf(new Date(iso + 'T00:00:00')) })
    dispatch({ type: 'setDay', day: weekdayIndex(iso) })
    setTab('day')
  }

  return (
    <div className={s.app}>
      <AlertHost />

      <main className={s.appMain}>
        {tab === 'day' && <DayView />}
        {tab === 'calendar' && <WeekCalendar />}
        {tab === 'month' && <MonthView onOpenDay={openDay} />}
        {tab === 'lists' && <Lists />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className={s.tabbar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={cx(s.tab, t.id === tab && s.active)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
