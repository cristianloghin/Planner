import { defineRoutes } from '@mikrostack/router'
import { Settings } from '../components/Settings'
import { DayRoute } from './DayRoute'
import { MonthRoute } from './MonthRoute'
import { WeekRoute } from './WeekRoute'

/**
 * The four tabs, as routes.
 *
 * The three calendar tabs are routes in `routes/` that read the domains and
 * compose the calendar view from slots (see `DayRoute`). `/settings` still
 * orchestrates inside the component.
 *
 * The event editor and the occurrence sheet are still route-local state
 * rather than routes of their own.
 *
 * `/` exists because the PWA's `start_url` is the bare base, so every cold
 * launch lands there. Guards run on the initial match (router >= 0.9), which
 * is why a redirect verdict is enough and no component has to navigate from
 * an effect.
 */
export const routes = defineRoutes({
  '/': { component: () => null, guard: () => '/day' },
  '/day': { component: DayRoute },
  '/week': { component: WeekRoute },
  '/month': { component: MonthRoute },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
