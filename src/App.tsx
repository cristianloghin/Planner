import { useState } from 'react'
import { WeekCalendar } from './components/WeekCalendar'
import { DayView } from './components/DayView'
import { MonthView } from './components/MonthView'
import { TaskList } from './components/TaskList'
import { Settings } from './components/Settings'
import { AlertHost } from './components/AlertHost'
import { mondayOf, weekdayIndex } from './lib/dates'
import { cx } from './lib/cx'
import { useApp } from './state'
import s from './App.module.css'

type Tab = 'day' | 'calendar' | 'month' | 'tasks' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'calendar', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'settings', label: 'People' },
]

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
        {tab === 'tasks' && <TaskList />}
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
