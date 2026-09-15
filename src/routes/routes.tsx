import { defineRoutes } from '@mikrostack/router'
import { isISODate, mondayOf, startOfMonth, toISODate } from '../assets/utils/dates'
import { DayRoute } from './DayRoute'
import { EditEventRoute, NewEventRoute } from './EventRoute'
import { NotesRoute, TemplatesRoute } from './LibraryRoute'
import { MonthRoute } from './MonthRoute'
import { SettingsRoute } from './SettingsRoute'
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
 * Every tab is a route that reads the domains and composes a view from slots
 * (see `DayRoute`).
 *
 * The event editor is a route (`/event/new`, `/event/:id`), so the back
 * button closes it and a reload keeps it open. The occurrence sheet is a
 * transient panel and stays route-local state.
 *
 * `/library` is a section whose title switches between templates and notes.
 * Each of the two draws the frame itself, since the buttons beside the title
 * are its own, and the bare `/library` is the templates. Everything under it
 * is top-level (`parent: null`): the two screens because nothing draws them an
 * outlet, the template editors because they are full-page.
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
  '/library': { component: TemplatesRoute },
  '/library/templates': { component: TemplatesRoute, parent: null },
  '/library/notes': { component: NotesRoute, parent: null },
  '/library/templates/new': { component: NewTemplateRoute, parent: null },
  '/library/templates/:id': { component: EditTemplateRoute, parent: null },
  '/settings': { component: SettingsRoute },
})

declare module '@mikrostack/router' {
  interface Register {
    routes: typeof routes
  }
}
