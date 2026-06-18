import type { AppState, CalendarEvent } from '../types'
import { checklistEntries } from './attachments'
import { latestStartOnOrBefore } from './recurrence'

/** Key for an occurrence's per-occurrence state: a specific event on a specific start date. */
export function occKey(eventId: string, date: string): string {
  return `${eventId}:${date}`
}

/**
 * Is the occurrence of `event` starting on `date` complete? Derived from its
 * checklist when it has one (all entries checked), else the manual `done` flag.
 * The non-empty-entries guard keeps an empty checklist from reading as "done".
 */
export function isOccurrenceDone(state: AppState, event: CalendarEvent, date: string): boolean {
  const st = state.completions[occKey(event.id, date)]
  const entries = checklistEntries(event)
  if (entries.length > 0) {
    const checked = st?.checked ?? {}
    return entries.every((entry) => checked[entry.id])
  }
  return !!st?.done
}

/**
 * Prerequisites that aren't satisfied for this occurrence: each `dependsOn`
 * event whose relevant occurrence (the latest at or before `date`) isn't done,
 * or hasn't happened yet.
 */
export function blockingPrerequisites(
  state: AppState,
  event: CalendarEvent,
  date: string,
): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const depId of event.dependsOn ?? []) {
    const dep = state.events.find((e) => e.id === depId)
    if (!dep) continue
    const depDate = latestStartOnOrBefore(dep, date)
    if (depDate == null || !isOccurrenceDone(state, dep, depDate)) out.push(dep)
  }
  return out
}

export type EventStatus = 'blocked' | 'ready' | 'done'

/** Advisory status for an occurrence. `blocked` never prevents completion — it only informs. */
export function occurrenceStatus(state: AppState, event: CalendarEvent, date: string): EventStatus {
  if (isOccurrenceDone(state, event, date)) return 'done'
  return blockingPrerequisites(state, event, date).length > 0 ? 'blocked' : 'ready'
}
