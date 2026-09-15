import { type ColorKey, DEFAULT_COLOR } from '../../assets/palette'
import { addDays, diffDays, minutesToTime, toDateTimeLocal } from '../../assets/utils/dates'
import type { PersonId } from '../people/types'
import { cloneReminders } from './transformers'
import type { CalendarEvent, EventReminder, EventTemplate, RecurrenceFreq } from './types'

/** Times snap to this many minutes; nothing timed is shorter than it. */
export const SNAP = 15

/**
 * How far an edit of a recurring event reaches: the whole series, or one
 * occurrence of it. An occurrence can only differ from its series in when it
 * happens and who is on it; everything else is the series' alone.
 */
export type EditScope = 'series' | 'occurrence'
const DAY_MIN = 24 * 60

export type RepeatChoice = 'none' | RecurrenceFreq
export type EndsChoice = 'never' | 'after' | 'on'

/**
 * What the editor form holds: every field as the input shows it, so a
 * half-typed picker can be held without becoming a broken event. `date`/`days`
 * describe an all-day event, `startDT`/`endDT` a timed one; both are kept so
 * toggling all-day does not lose the other.
 */
export interface EventDraft {
  title: string
  allDay: boolean
  date: string
  days: number
  startDT: string
  endDT: string
  attendees: PersonId[]
  colorKey?: ColorKey
  repeat: RepeatChoice
  interval: number
  /** Exactly one of count / until is ever written; the choice is the state. */
  ends: EndsChoice
  endCount: number
  endDate: string
  reminders: EventReminder[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * datetime-local value for a date + minutes-from-midnight. Minutes past the
 * day roll into the next date — `<input type="datetime-local">` rejects the
 * out-of-range "T24:00" and would render an empty field.
 */
export function dtLocal(date: string, minute: number): string {
  if (minute >= DAY_MIN) {
    return `${addDays(date, Math.floor(minute / DAY_MIN))}T${minutesToTime(minute % DAY_MIN)}`
  }
  return `${date}T${minutesToTime(minute)}`
}

function clockMinutes(dt: string): number {
  const [h, m] = dt.slice(11).split(':').map(Number)
  return h * 60 + m
}

/**
 * Whole minutes between two datetime-local strings (b - a), in wall-clock
 * terms: day difference × 24h + clock difference. Subtracting epoch times
 * would shift durations by ±60 min across a DST transition.
 */
export function minutesBetween(a: string, b: string): number {
  return diffDays(b.slice(0, 10), a.slice(0, 10)) * DAY_MIN + (clockMinutes(b) - clockMinutes(a))
}

/**
 * A complete, parseable datetime-local value ("yyyy-mm-ddThh:mm"). A cleared
 * or half-typed picker emits "" — saving that would persist NaN durations.
 */
export function isCompleteDT(v: string): boolean {
  return v.length >= 16 && ISO_DATE_RE.test(v.slice(0, 10)) && !Number.isNaN(new Date(v).getTime())
}

/** An empty draft on `date`, at nine unless the seed says otherwise. */
export function draftForNew(seed: {
  date: string
  attendees: PersonId[]
  allDay?: boolean
  startMin?: number
  endMin?: number
}): EventDraft {
  const startMin = seed.startMin ?? 9 * 60
  const endMin = seed.endMin ?? Math.min(startMin + 60, DAY_MIN)
  return {
    title: '',
    allDay: seed.allDay ?? false,
    date: seed.date,
    days: 1,
    startDT: dtLocal(seed.date, startMin),
    endDT: dtLocal(seed.date, endMin),
    attendees: seed.attendees,
    repeat: 'none',
    interval: 1,
    ends: 'never',
    endCount: 12,
    endDate: '',
    reminders: [],
  }
}

/**
 * A draft describing `event` as it stands. For an occurrence, pass the
 * occurrence re-anchored on its own day, so the form shows that day and any
 * one-off override rather than the series' first instance.
 */
export function draftForEvent(event: CalendarEvent): EventDraft {
  const date = event.start.slice(0, 10)
  const end = new Date(event.start)
  end.setMinutes(end.getMinutes() + event.duration)
  return {
    title: event.title,
    allDay: event.allDay,
    date,
    days: event.allDay ? Math.max(1, event.duration) : 1,
    startDT: event.allDay ? dtLocal(date, 9 * 60) : event.start,
    endDT: event.allDay ? dtLocal(date, 10 * 60) : toDateTimeLocal(end),
    attendees: event.attendees,
    ...(event.colorKey ? { colorKey: event.colorKey } : {}),
    repeat: event.recurrence?.freq ?? 'none',
    interval: event.recurrence?.interval ?? 1,
    ends: event.recurrence?.count != null ? 'after' : event.recurrence?.until ? 'on' : 'never',
    endCount: event.recurrence?.count ?? 12,
    endDate: event.recurrence?.until ?? '',
    reminders: event.reminders,
  }
}

/** The duration the draft describes: whole days all-day, else minutes. */
export function draftDuration(d: EventDraft): number {
  return d.allDay ? Math.max(1, d.days) : Math.max(SNAP, minutesBetween(d.startDT, d.endDT))
}

/** Timing the draft can actually save: complete pickers and finite numbers. */
export function draftTimingValid(d: EventDraft): boolean {
  return d.allDay
    ? ISO_DATE_RE.test(d.date) && Number.isFinite(d.days)
    : isCompleteDT(d.startDT) && isCompleteDT(d.endDT)
}

/** Whether the draft is something that can be saved at all. */
export function draftValid(d: EventDraft): boolean {
  return d.title.trim() !== '' && draftTimingValid(d)
}

/** The event the draft describes (no id). */
export function eventFromDraft(d: EventDraft): Omit<CalendarEvent, 'id'> {
  return {
    title: d.title.trim(),
    start: d.allDay ? d.date : d.startDT,
    allDay: d.allDay,
    duration: draftDuration(d),
    recurrence:
      d.repeat === 'none'
        ? undefined
        : {
            freq: d.repeat,
            interval: Math.max(1, d.interval),
            // Exactly one end, or neither. Writing both would leave the two
            // racing, and clearing the other is what makes switching between
            // them actually take effect.
            ...(d.ends === 'after' ? { count: Math.max(1, d.endCount) } : {}),
            ...(d.ends === 'on' && d.endDate ? { until: d.endDate } : {}),
          },
    attendees: d.attendees,
    ...(d.colorKey ? { colorKey: d.colorKey } : {}),
    reminders: d.reminders,
  }
}

/**
 * The draft as a reusable template (no id); reminders get fresh ids. The
 * people are left behind — a template is for anyone. `colorKey` is the colour
 * the event shows in, resolved by the caller: a draft with no colour of its
 * own is drawn in its lane's, and that is what the template keeps.
 */
export function templateFromDraft(d: EventDraft, colorKey: ColorKey): Omit<EventTemplate, 'id'> {
  return {
    title: d.title.trim(),
    allDay: d.allDay,
    duration: draftDuration(d),
    colorKey,
    reminders: cloneReminders(d.reminders),
  }
}

/**
 * The draft pre-filled from a template: its title, colour, reminders (with
 * fresh ids) and shape. The people stay the draft's own. A timed template
 * keeps the draft's chosen start and stretches the end to the template's
 * duration.
 */
export function applyTemplate(d: EventDraft, t: EventTemplate): EventDraft {
  const next: EventDraft = {
    ...d,
    title: t.title,
    colorKey: t.colorKey,
    reminders: cloneReminders(t.reminders),
    allDay: t.allDay,
  }
  if (t.allDay) return { ...next, days: Math.max(1, t.duration) }
  const end = new Date(d.startDT)
  end.setMinutes(end.getMinutes() + Math.max(SNAP, t.duration))
  return { ...next, endDT: toDateTimeLocal(end) }
}

/** A moved start keeps the draft's duration, once both pickers are settled. */
export function moveStart(d: EventDraft, startDT: string): EventDraft {
  if (!isCompleteDT(startDT) || !isCompleteDT(d.startDT) || !isCompleteDT(d.endDT)) {
    return { ...d, startDT }
  }
  const dur = Math.max(SNAP, minutesBetween(d.startDT, d.endDT))
  const end = new Date(startDT)
  end.setMinutes(end.getMinutes() + dur)
  return { ...d, startDT, endDT: toDateTimeLocal(end) }
}

/**
 * What the template form holds. A template is a blueprint with no point in
 * time, so a timed duration is entered as hours and minutes, an all-day one as
 * whole days; both are kept so toggling all-day does not lose the other.
 */
export interface TemplateDraft {
  title: string
  allDay: boolean
  days: number
  hours: number
  minutes: number
  colorKey: ColorKey
  reminders: EventReminder[]
}

/** An empty template: an hour, timed, in the default colour. */
export function templateDraftForNew(): TemplateDraft {
  return {
    title: '',
    allDay: false,
    days: 1,
    hours: 1,
    minutes: 0,
    colorKey: DEFAULT_COLOR,
    reminders: [],
  }
}

/** A draft describing `template` as it stands. */
export function templateDraftFor(t: EventTemplate): TemplateDraft {
  return {
    title: t.title,
    allDay: t.allDay,
    days: t.allDay ? Math.max(1, t.duration) : 1,
    hours: t.allDay ? 1 : Math.floor(t.duration / 60),
    minutes: t.allDay ? 0 : t.duration % 60,
    colorKey: t.colorKey,
    reminders: t.reminders,
  }
}

/** The duration the draft describes: whole days all-day, else minutes. */
export function templateDraftDuration(d: TemplateDraft): number {
  return d.allDay ? Math.max(1, d.days) : Math.max(SNAP, d.hours * 60 + d.minutes)
}

export function templateDraftValid(d: TemplateDraft): boolean {
  return d.title.trim() !== ''
}

/**
 * Whether saving `draft` would write something other than `initial` would.
 * Compares the templates the two describe, not the form fields, so typing
 * hours into an all-day template (which saves whole days) is not a change.
 */
export function templateDraftChanged(draft: TemplateDraft, initial: TemplateDraft): boolean {
  return (
    JSON.stringify(templateFromTemplateDraft(draft)) !==
    JSON.stringify(templateFromTemplateDraft(initial))
  )
}

/** The template the draft describes (no id). */
export function templateFromTemplateDraft(d: TemplateDraft): Omit<EventTemplate, 'id'> {
  return {
    title: d.title.trim(),
    allDay: d.allDay,
    duration: templateDraftDuration(d),
    colorKey: d.colorKey,
    reminders: d.reminders,
  }
}
