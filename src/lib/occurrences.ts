import type { AppState, CalendarEvent, OccurrenceStatusCode } from '../types'
import { checklistEntries } from './attachments'

/** Key for an occurrence's per-occurrence state: a specific event on a specific start date. */
export function occKey(eventId: string, date: string): string {
  return `${eventId}:${date}`
}

/**
 * Is the occurrence of `event` starting on `date` complete? Derived from its
 * checklist when it has one (all entries checked), else the explicit `done`
 * status. The non-empty-entries guard keeps an empty checklist from reading as
 * "done".
 */
export function isOccurrenceDone(state: AppState, event: CalendarEvent, date: string): boolean {
  const st = state.completions[occKey(event.id, date)]
  const entries = checklistEntries(event)
  if (entries.length > 0) {
    const checked = st?.checked ?? {}
    return entries.every((entry) => checked[entry.id])
  }
  return st?.status === 'done'
}

/**
 * The effective status of an occurrence for gating purposes: a checklist-complete
 * occurrence counts as `done` even without an explicit status row; otherwise the
 * explicitly-set status, or `null` if none.
 */
export function occurrenceEffectiveStatus(
  state: AppState,
  event: CalendarEvent,
  date: string,
): OccurrenceStatusCode | null {
  if (isOccurrenceDone(state, event, date)) return 'done'
  return state.completions[occKey(event.id, date)]?.status ?? null
}

/** A prerequisite edge that isn't satisfied for a given dependent occurrence. */
export interface UnmetPrerequisite {
  event: CalendarEvent
  date: string
  requiredStatus: OccurrenceStatusCode
  actualStatus: OccurrenceStatusCode | null
}

/**
 * Prerequisites that aren't satisfied for this occurrence: each enumerated
 * `occurrence_dependency` edge whose prerequisite occurrence hasn't reached the
 * edge's `required_status`. An edge whose prerequisite event no longer exists is
 * dropped (the DB cascades it; in-memory we just skip it).
 */
export function blockingPrerequisites(
  state: AppState,
  event: CalendarEvent,
  date: string,
): UnmetPrerequisite[] {
  const edges = state.dependencies[occKey(event.id, date)] ?? []
  const out: UnmetPrerequisite[] = []
  for (const edge of edges) {
    const dep = state.events.find((e) => e.id === edge.prerequisiteSeriesId)
    if (!dep) continue
    const actualStatus = occurrenceEffectiveStatus(state, dep, edge.prerequisiteDate)
    if (actualStatus !== edge.requiredStatus) {
      out.push({ event: dep, date: edge.prerequisiteDate, requiredStatus: edge.requiredStatus, actualStatus })
    }
  }
  return out
}

export type EventStatus = 'blocked' | 'ready' | 'done'

/** Advisory status for an occurrence. `blocked` never prevents completion — it only informs. */
export function occurrenceStatus(state: AppState, event: CalendarEvent, date: string): EventStatus {
  if (isOccurrenceDone(state, event, date)) return 'done'
  return blockingPrerequisites(state, event, date).length > 0 ? 'blocked' : 'ready'
}
