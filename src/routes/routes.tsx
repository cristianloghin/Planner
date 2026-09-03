import { defineRoutes, useNavigation } from '@mikrostack/router'
import { MonthView } from '../components/MonthView'
import { Settings } from '../components/Settings'
import { WeekCalendar } from '../components/WeekCalendar'
import { useCalendarNavigation } from '../navigation'
import { DayRoute } from './DayRoute'

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
 * The four tabs, as routes.
 *
 * `/day` is the shape the rest are moving to: a route in `routes/` that reads
 * the domains and hands a props-only view plain data (see `DayRoute`). The
 * other three still orchestrate inside the component.
 *
 * The event editor and the occurrence sheet are still local state — held by
 * the route for `/day`, by the component elsewhere — rather than routes of
 * their own.
 *
 * `/` exists because the PWA's `start_url` is the bare base, so every cold
 * launch lands there. Guards run on the initial match (router >= 0.9), which
 * is why a redirect verdict is enough and no component has to navigate from
 * an effect.
 */
export const routes = defineRoutes({
  '/': { component: () => null, guard: () => '/day' },
  '/day': { component: DayRoute },
  '/week': { component: WeekCalendar },
  '/month': { component: MonthRoute },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
