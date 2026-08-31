/**
 * Turning a stored series into an event or a blueprint, and back.
 *
 * Used only inside this domain. The interesting part is the checklists: the
 * database has no notion of a checklist as a thing, only lines each carrying a
 * heading and a position. Putting them back together — and taking them apart
 * again to save — happens here, where it can be tested without a database.
 */
import type { Series } from '../../client/series'
import { toISODate } from '../../lib/dates'
import type { Attachment, CalendarEvent, EventTemplate } from './types'

/** Lines of one checklist are `${GROUP_STRIDE}` apart, so their order survives. */
const GROUP_STRIDE = 1000

/**
 * Everything attached to a series, in display order.
 *
 * Checklists come back first, then notes, then reminders. The database does not
 * record the order the three kinds were written in, so that grouping is the
 * order — the contents survive a round trip, but interleaving a note between
 * two checklists does not.
 *
 * Lines are sorted before grouping, because their position is what says which
 * checklist they belong to. Walking them in order reproduces the same
 * checklists every time, whatever order the rows arrived in.
 */
export function toAttachments(
  seriesId: string,
  { checklist, notes, reminders }: Pick<Series, 'checklist' | 'notes' | 'reminders'>,
): Attachment[] {
  const out: Attachment[] = []

  const groups = new Map<string, { id: string; title: string }[]>()
  for (const line of [...checklist].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const heading = line.groupLabel ?? ''
    const lines = groups.get(heading)
    if (lines) lines.push({ id: line.id, title: line.label })
    else groups.set(heading, [{ id: line.id, title: line.label }])
  }
  for (const [heading, items] of groups) {
    out.push({
      // Built from the series and the heading, so a checklist keeps the same
      // identity across reloads — it has no row of its own to get an id from.
      id: `${seriesId}:checklist:${heading}`,
      kind: 'checklist',
      title: heading || undefined,
      items,
    })
  }

  for (const n of notes) out.push({ id: n.id, kind: 'note', text: n.body })
  for (const r of reminders) out.push({ id: r.id, kind: 'reminder', offset: r.offset })
  return out
}

/**
 * Attachments taken apart into the rows that store them.
 *
 * Each checklist's lines are numbered from its own block, which is what lets
 * {@link toAttachments} tell them apart again. Two checklists sharing a heading
 * would merge on the way back, so headings are effectively their identity.
 */
export function fromAttachments(
  attachments: Attachment[],
): Pick<Series, 'checklist' | 'notes' | 'reminders'> {
  const checklists = attachments.filter((a) => a.kind === 'checklist')
  return {
    checklist: checklists.flatMap((c, ci) =>
      c.items.map((item, idx) => ({
        id: item.id,
        label: item.title,
        groupLabel: c.title ?? null,
        sortOrder: ci * GROUP_STRIDE + idx,
      })),
    ),
    notes: attachments.filter((a) => a.kind === 'note').map((n) => ({ id: n.id, body: n.text })),
    reminders: attachments
      .filter((a) => a.kind === 'reminder')
      .map((r) => ({ id: r.id, offset: r.offset })),
  }
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
    attachments: toAttachments(series.id, series),
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
    attachments: toAttachments(series.id, series),
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
    ...fromAttachments(event.attachments),
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
    ...fromAttachments(template.attachments),
    isTemplate: true,
  }
}
