import { defineRoutes, useNavigation } from '@mikrostack/router'
import { DayView } from '../components/DayView'
import { Lists } from '../components/Lists'
import { MonthView } from '../components/MonthView'
import { Settings } from '../components/Settings'
import { WeekCalendar } from '../components/WeekCalendar'
import { useApp } from '../state'

/**
 * The Month grid opens a day in the Day view. The visible date is still
 * reducer state — it does not live in the URL yet — so the jump is a dispatch
 * plus a route change. Wrapping it here keeps MonthView's existing prop and
 * leaves the component itself untouched.
 */
function MonthRoute() {
  const { dispatch } = useApp()
  const { navigate } = useNavigation()

  return (
    <MonthView
      onOpenDay={(iso) => {
        dispatch({ type: 'goToDate', date: iso })
        navigate('/day')
      }}
    />
  )
}

/**
 * The five tabs, as routes. The views are unchanged: they still read the
 * reducer through `useApp()`, and everything they open (the event editor, the
 * occurrence sheet) is still their own local state rather than a route.
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
  '/lists': { component: Lists },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
