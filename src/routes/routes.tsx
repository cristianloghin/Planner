import { defineRoutes } from '@mikrostack/router'
import { isISODate, mondayOf, startOfMonth, toISODate } from '../assets/utils/dates'
import { Settings } from '../components/Settings'
import { DayRoute } from './DayRoute'
import { EditEventRoute, NewEventRoute } from './EventRoute'
import { MonthRoute } from './MonthRoute'
import { WeekRoute } from './WeekRoute'

const today = () => toISODate(new Date())

/**
 * The four tabs, as routes.
 *
 * Where the calendar is looking is in the URL — a day, a week's Monday, a
 * month's first — so a screen can be linked to, the back button walks the
 * dates, and the three calendar routes share no navigation state. Each guard
 * normalises its param: a malformed date goes to today, a week that is not a
 * Monday or a month that is not a first is redirected to the one it is in.
 *
 * The three calendar tabs read the domains and compose the calendar view from
 * slots (see `DayRoute`). `/settings` still orchestrates inside the component.
 *
 * The event editor is a route (`/event/new`, `/event/:id`), so the back
 * button closes it and a reload keeps it open. The occurrence sheet is a
 * transient panel and stays route-local state.
 *
 * `/` exists because the PWA's `start_url` is the bare base, so every cold
 * launch lands there. Guards run on the initial match (router >= 0.9), which
 * is why a redirect verdict is enough and no component has to navigate from
 * an effect.
 */
export const routes = defineRoutes({
  '/': { component: () => null, guard: () => `/day/${today()}` },
  '/day/:date': {
    component: DayRoute,
    guard: ({ date }) => isISODate(date) || `/day/${today()}`,
  },
  '/week/:weekStart': {
    component: WeekRoute,
    guard: ({ weekStart }) => {
      if (!isISODate(weekStart)) return `/week/${mondayOf(new Date())}`
      const monday = mondayOf(new Date(`${weekStart}T00:00:00`))
      return monday === weekStart || `/week/${monday}`
    },
  },
  '/month/:month': {
    component: MonthRoute,
    guard: ({ month }) => {
      if (!isISODate(month)) return `/month/${startOfMonth(today())}`
      const first = startOfMonth(month)
      return first === month || `/month/${first}`
    },
  },
  '/event/new': { component: NewEventRoute },
  '/event/:id': { component: EditEventRoute },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
