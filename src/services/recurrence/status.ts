/**
 * Whether a day counts as done, and what is holding it up.
 *
 * Fed the per-day state and the events it refers to; fetches nothing and looks
 * nothing up for itself.
 */
import type { CalendarEvent, ChecklistEntry } from '../../domains/events/types'
import type {
  CompletionsMap,
  OccurrenceDependency,
  OccurrenceStatusCode,
} from '../../domains/occurrences/types'

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
 * checklist when it has one (all entries checked), else the explicit `done`
 * status. The non-empty-entries guard keeps an empty checklist from reading as
 * "done". `completions` is the windowed per-occurrence state covering `date`
 * (src/domains/occurrences).
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
  dependencies: Record<string, OccurrenceDependency[]>,
  events: CalendarEvent[],
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): UnmetPrerequisite[] {
  const edges = dependencies[occKey(event.id, date)] ?? []
  const out: UnmetPrerequisite[] = []
  for (const edge of edges) {
    const dep = events.find((e) => e.id === edge.prerequisiteSeriesId)
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
  dependencies: Record<string, OccurrenceDependency[]>,
  events: CalendarEvent[],
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
): EventStatus {
  if (isOccurrenceDone(completions, event, date)) return 'done'
  return blockingPrerequisites(dependencies, events, completions, event, date).length > 0
    ? 'blocked'
    : 'ready'
}

/**
 * The prerequisite dates referenced by dependency edges whose DEPENDENT
 * occurrence falls in the inclusive [from, to] date range. Views feed these to
 * the completions window fetch as extra dates, so a prerequisite living outside
 * the visible window still resolves its met/unmet status.
 */
export function prerequisiteDatesInRange(
  dependencies: Record<string, OccurrenceDependency[]>,
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
