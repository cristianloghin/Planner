import type { AppState, CalendarEvent, CompletionsMap, OccurrenceStatusCode } from '../types'
import { checklistEntries } from './attachments'

/** Key for an occurrence's per-occurrence state: a specific event on a specific start date. */
export function occKey(eventId: string, date: string): string {
  return `${eventId}:${date}`
}

/**
 * Is the occurrence of `event` starting on `date` complete? Derived from its
 * checklist when it has one (all entries checked), else the explicit `done`
 * status. The non-empty-entries guard keeps an empty checklist from reading as
 * "done". `completions` is the windowed per-occurrence state covering `date`
 * (src/data/completions.ts).
 */
export function isOccurrenceDone(
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): boolean {
  const st = completions[occKey(event.id, date)]
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
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): OccurrenceStatusCode | null {
  if (isOccurrenceDone(completions, event, date)) return 'done'
  return completions[occKey(event.id, date)]?.status ?? null
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
 * dropped (the DB cascades it; in-memory we just skip it). `completions` must
 * cover the prerequisite dates too — see {@link prerequisiteDatesInRange}.
 */
export function blockingPrerequisites(
  state: AppState,
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): UnmetPrerequisite[] {
  const edges = state.dependencies[occKey(event.id, date)] ?? []
  const out: UnmetPrerequisite[] = []
  for (const edge of edges) {
    const dep = state.events.find((e) => e.id === edge.prerequisiteSeriesId)
    if (!dep) continue
    const actualStatus = occurrenceEffectiveStatus(completions, dep, edge.prerequisiteDate)
    if (actualStatus !== edge.requiredStatus) {
      out.push({
        event: dep,
        date: edge.prerequisiteDate,
        requiredStatus: edge.requiredStatus,
        actualStatus,
      })
    }
  }
  return out
}

export type EventStatus = 'blocked' | 'ready' | 'done'

/** Advisory status for an occurrence. `blocked` never prevents completion — it only informs. */
export function occurrenceStatus(
  state: AppState,
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): EventStatus {
  if (isOccurrenceDone(completions, event, date)) return 'done'
  return blockingPrerequisites(state, completions, event, date).length > 0 ? 'blocked' : 'ready'
}

/**
 * The prerequisite dates referenced by dependency edges whose DEPENDENT
 * occurrence falls in the inclusive [from, to] date range. Views feed these to
 * the completions window fetch as extra dates, so a prerequisite living outside
 * the visible window still resolves its met/unmet status.
 */
export function prerequisiteDatesInRange(
  dependencies: AppState['dependencies'],
  from: string,
  to: string,
): string[] {
  const out = new Set<string>()
  for (const [k, edges] of Object.entries(dependencies)) {
    const date = k.slice(k.indexOf(':') + 1)
    if (date >= from && date <= to) {
      for (const edge of edges) out.add(edge.prerequisiteDate)
    }
  }
  return [...out].sort()
}
