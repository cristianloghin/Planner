import { defineRoutes, useNavigation } from '@mikrostack/router'
import { DayView } from '../components/DayView'
import { MonthView } from '../components/MonthView'
import { Settings } from '../components/Settings'
import { WeekCalendar } from '../components/WeekCalendar'
import { useCalendarNavigation } from '../navigation'

/**
 * The Month grid opens a day in the Day view. The visible date lives in the
 * navigation context rather than the URL for now, so the jump is a context
 * update plus a route change. Wrapping it here keeps MonthView's existing prop
 * and leaves the component itself untouched.
 */
function MonthRoute() {
  const nav = useCalendarNavigation()
  const { navigate } = useNavigation()

  return (
    <MonthView
      onOpenDay={(iso) => {
        nav.goToDate(iso)
        navigate('/day')
      }}
    />
  )
}

/**
 * The four tabs, as routes. Everything a view opens (the event editor, the
 * occurrence sheet) is still its own local state rather than a route.
 *
 * `/` exists because the PWA's `start_url` is the bare base, so every cold
 * launch lands there. Guards run on the initial match (router >= 0.9), which
 * is why a redirect verdict is enough and no component has to navigate from
 * an effect.
 */
export const routes = defineRoutes({
  '/': { component: () => null, guard: () => '/day' },
  '/day': { component: DayView },
  '/week': { component: WeekCalendar },
  '/month': { component: MonthRoute },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
