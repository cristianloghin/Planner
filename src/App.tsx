import { useState } from 'react'
import { WeekCalendar } from './components/WeekCalendar'
import { DayView } from './components/DayView'
import { TaskList } from './components/TaskList'
import { Settings } from './components/Settings'
import { useApp } from './state'

type Tab = 'day' | 'calendar' | 'tasks' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'calendar', label: 'Week' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'settings', label: 'People' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('day')
  const { state } = useApp()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Planner</h1>
        <div className="people-legend">
          {Object.values(state.people).map((p) => (
            <span key={p.id} className="legend-item">
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </header>

      <main className="app-main">
        {tab === 'day' && <DayView />}
        {tab === 'calendar' && <WeekCalendar />}
        {tab === 'tasks' && <TaskList />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
