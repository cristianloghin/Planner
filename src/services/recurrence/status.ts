/**
 * Whether a day counts as done.
 *
 * Fed the per-day state and the events it refers to; fetches nothing and looks
 * nothing up for itself.
 */
import type { CalendarEvent, ChecklistEntry } from '../../domains/events/types'
import type { CompletionsMap } from '../../domains/occurrences/types'

/**
 * Every checklist line on an event, across all its checklists.
 *
 * Inlined rather than taken from the events domain: a service cannot reach into
 * a domain, and this is a one-line read over a shape it was handed.
 */
function checklistEntries(event: { attachments: CalendarEvent['attachments'] }): ChecklistEntry[] {
  return event.attachments.flatMap((a) => (a.kind === 'checklist' ? a.items : []))
}

/**
 * Where one day of one event is filed.
 *
 * The same format `domains/occurrences` uses (`occurrenceKey` there). Two
 * copies of one line, because a service may not import a domain and there is no
 * layer below both yet — they must agree, and a change to either is a change to
 * both.
 */
export function occKey(eventId: string, date: string): string {
  return `${eventId}:${date}`
}

/**
 * Is the occurrence of `event` starting on `date` complete? Derived from its
 * checklist: every entry checked. The non-empty-entries guard keeps an empty
 * checklist from reading as "done", and an event with no checklist can no
 * longer be done at all — the explicit status this used to fall back on is
 * gone. `completions` is the windowed per-occurrence state covering `date`
 * (src/domains/occurrences).
 */
export function isOccurrenceDone(
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): boolean {
  const entries = checklistEntries(event)
  if (entries.length === 0) return false
  const checked = completions[occKey(event.id, date)]?.checked ?? {}
  return entries.every((entry) => checked[entry.id])
}
