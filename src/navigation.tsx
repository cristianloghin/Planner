/**
 * Where the calendar is looking: the Monday of the visible week, and which
 * weekday the Day view shows. Per-session navigation, not data — it was never
 * saved, and it is not a URL yet (the routes work moves it there).
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'
import { addDays, mondayOf, weekdayIndex } from './assets/utils/dates'

export interface VisibleDate {
  /** ISO date (yyyy-mm-dd) of the Monday of the week being viewed. */
  weekStart: string
  /** 0 = Monday ... 6 = Sunday — the day shown in the Day view. */
  selectedDay: number
}

export function visibleDateOn(today: Date): VisibleDate {
  return { weekStart: mondayOf(today), selectedDay: (today.getDay() + 6) % 7 }
}

/** One day forward or back, rolling into the neighbouring week at either end. */
export function stepDay(at: VisibleDate, delta: number): VisibleDate {
  let day = at.selectedDay + delta
  let weekStart = at.weekStart
  if (day < 0) {
    day = 6
    weekStart = addDays(weekStart, -7)
  } else if (day > 6) {
    day = 0
    weekStart = addDays(weekStart, 7)
  }
  return { weekStart, selectedDay: day }
}

/** The week containing an ISO date, with that day selected. */
export function visibleDateAt(date: string): VisibleDate {
  return { weekStart: mondayOf(new Date(`${date}T00:00:00`)), selectedDay: weekdayIndex(date) }
}

export interface CalendarNavigation extends VisibleDate {
  shiftWeek: (delta: number) => void
  setWeek: (weekStart: string) => void
  shiftDay: (delta: number) => void
  goToDate: (date: string) => void
}

const NavigationContext = createContext<CalendarNavigation | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [at, setAt] = useState(() => visibleDateOn(new Date()))
  const shiftWeek = useCallback(
    (delta: number) => setAt((a) => ({ ...a, weekStart: addDays(a.weekStart, delta * 7) })),
    [],
  )
  const setWeek = useCallback((weekStart: string) => setAt((a) => ({ ...a, weekStart })), [])
  const shiftDay = useCallback((delta: number) => setAt((a) => stepDay(a, delta)), [])
  const goToDate = useCallback((date: string) => setAt(visibleDateAt(date)), [])
  const value = useMemo(
    () => ({ ...at, shiftWeek, setWeek, shiftDay, goToDate }),
    [at, shiftWeek, setWeek, shiftDay, goToDate],
  )
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useCalendarNavigation(): CalendarNavigation {
  const nav = useContext(NavigationContext)
  if (!nav) throw new Error('useCalendarNavigation must be used within NavigationProvider')
  return nav
}
