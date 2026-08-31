/**
 * What the events look like the moment an edit is made, before the server has
 * confirmed it.
 *
 * Pure, so the rules a screen shows instantly can be tested without a database
 * or a cache.
 *
 * There is deliberately nothing here for splitting a repeating event. That one
 * makes a second event on the server, with its own new id and its own fresh
 * copies of everything attached — none of which can be guessed at here. Showing
 * a guess and then replacing it is worse than waiting, so it re-reads instead.
 */
import type { CalendarEvent, EventTemplate } from './types'

/** With an event added or replaced, whichever it turns out to be. */
export function patchSaveEvent(events: CalendarEvent[], event: CalendarEvent): CalendarEvent[] {
  return events.some((e) => e.id === event.id)
    ? events.map((e) => (e.id === event.id ? event : e))
    : [...events, event]
}

export function patchRemoveEvent(events: CalendarEvent[], id: string): CalendarEvent[] {
  return events.filter((e) => e.id !== id)
}

/** With a blueprint added or replaced. */
export function patchSaveTemplate(
  templates: EventTemplate[],
  template: EventTemplate,
): EventTemplate[] {
  return templates.some((t) => t.id === template.id)
    ? templates.map((t) => (t.id === template.id ? template : t))
    : [...templates, template]
}

export function patchRemoveTemplate(templates: EventTemplate[], id: string): EventTemplate[] {
  return templates.filter((t) => t.id !== id)
}
