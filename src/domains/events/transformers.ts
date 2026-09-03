import { toISODate } from '../../assets/utils/dates'
/**
 * Turning a stored series into an event or a blueprint, and back.
 *
 * Used only inside this domain. Reminders carry straight through — the stored
 * shape and the app's are the same `{ id, offset }` — so this is now just the
 * event/blueprint split and the missing-date rule.
 */
import { uid } from '../../assets/utils/id'
import type { Series } from '../../client/series'
import type { CalendarEvent, EventReminder, EventTemplate } from './types'

/**
 * Reminders copied with **fresh ids**, for the template ↔ event copy paths: the
 * copy owns brand-new `reminder` rows rather than aliasing the source's.
 */
export function cloneReminders(reminders: EventReminder[]): EventReminder[] {
  return reminders.map((r) => ({ ...r, id: uid() }))
}

/**
 * A stored series read as an event.
 *
 * A series with no start becomes one starting today. An event has to be
 * somewhere on the calendar to be drawn at all, and today is where a person
 * would look for it — that is the app's answer to a missing date, not the
 * database's, which is why it is here.
 */
export function toEvent(series: Series): CalendarEvent {
  return {
    id: series.id,
    title: series.title,
    start: series.start ?? toISODate(new Date()),
    allDay: series.allDay,
    duration: series.duration,
    recurrence: series.recurrence,
    attendees: series.attendees,
    colorKey: series.colorKey,
    reminders: series.reminders,
  }
}

/** A stored series read as a blueprint: everything but the timing. */
export function toTemplate(series: Series): EventTemplate {
  return {
    id: series.id,
    title: series.title,
    allDay: series.allDay,
    duration: series.duration,
    attendees: series.attendees,
    reminders: series.reminders,
  }
}

/** An event as the series to store. */
export function fromEvent(event: CalendarEvent): Series {
  return {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    start: event.start,
    duration: event.duration,
    recurrence: event.recurrence,
    attendees: event.attendees,
    colorKey: event.colorKey,
    reminders: event.reminders,
    isTemplate: false,
  }
}

/**
 * A blueprint as the series to store: no start and no repeat, which is exactly
 * what makes it a blueprint rather than an event.
 */
export function fromTemplate(template: EventTemplate): Series {
  return {
    id: template.id,
    title: template.title,
    allDay: template.allDay,
    start: null,
    duration: template.duration,
    recurrence: undefined,
    attendees: template.attendees,
    colorKey: undefined,
    reminders: template.reminders,
    isTemplate: true,
  }
}
