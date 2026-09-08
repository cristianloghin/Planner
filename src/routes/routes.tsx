import { defineRoutes } from '@mikrostack/router'
import { isISODate, mondayOf, startOfMonth, toISODate } from '../assets/utils/dates'
import { Settings } from '../components/Settings'
import { DayRoute } from './DayRoute'
import { EditEventRoute, NewEventRoute } from './EventRoute'
import { LibraryRoute, NotesRoute, TemplatesRoute } from './LibraryRoute'
import { MonthRoute } from './MonthRoute'
import { EditTemplateRoute, NewTemplateRoute } from './TemplateRoute'
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
 * `/library` is a section whose title switches between templates and notes:
 * its route draws the frame and the matched child fills it through the
 * outlet. Templates are its index. The template editors opt out of the nesting (`parent: null`):
 * they are full-page, so there is nothing to draw beneath them.
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
  '/library': { component: LibraryRoute, index: TemplatesRoute },
  '/library/templates': { component: TemplatesRoute },
  '/library/notes': { component: NotesRoute },
  '/library/templates/new': { component: NewTemplateRoute, parent: null },
  '/library/templates/:id': { component: EditTemplateRoute, parent: null },
  '/settings': { component: Settings },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
