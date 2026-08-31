/**
 * What one day looks like the moment something is recorded against it, before
 * the server has confirmed it.
 *
 * Pure, so the rules a screen shows instantly can be tested without a database
 * or a cache. These mirror what the server does, including the part that is
 * easy to miss: a day left with nothing recorded has no entry at all, matching
 * the read, which leaves such rows out.
 */
import type { OccurrenceStatusCode } from '../../client/occurrences'
import type { OccurrenceDependency, OccurrenceState } from './types'

/** Every change to one day, as one set of values that can be written down. */
export type OccurrenceChange =
  | { kind: 'status'; status: OccurrenceStatusCode | null }
  | { kind: 'tick'; entryId: string; checked: boolean }
  | { kind: 'override'; start: string; duration: number }
  | { kind: 'clearOverride' }
  | { kind: 'cancel' }

/**
 * One day's state with `change` applied.
 *
 * Clearing a status keeps everything else on the day — it may also have been
 * moved, or taken out — which is exactly what the write does.
 */
export function patchEntry(
  entry: OccurrenceState | undefined,
  change: OccurrenceChange,
): OccurrenceState {
  switch (change.kind) {
    case 'status': {
      const { status: _cleared, ...rest } = entry ?? {}
      return change.status ? { ...rest, status: change.status } : rest
    }
    case 'tick':
      return { ...entry, checked: { ...entry?.checked, [change.entryId]: change.checked } }
    case 'override':
      return { ...entry, start: change.start, duration: change.duration }
    case 'clearOverride': {
      const { start: _s, duration: _d, ...rest } = entry ?? {}
      return rest
    }
    case 'cancel':
      return { ...entry, cancelled: true }
  }
}

/**
 * A window of days with `change` applied to one of them.
 *
 * A day patched back to nothing is dropped rather than left as an empty entry,
 * so it reads the same as a day nothing ever happened on.
 */
export function patchCompletions(
  completions: Record<string, OccurrenceState>,
  key: string,
  change: OccurrenceChange,
): Record<string, OccurrenceState> {
  const next = { ...completions }
  const patched = patchEntry(completions[key], change)
  if (Object.keys(patched).length) next[key] = patched
  else delete next[key]
  return next
}

/**
 * With one day waiting on another. Adding the same wait twice replaces it, so
 * changing how far along the other day has to be does not leave two.
 */
export function patchAddDependency(
  deps: Record<string, OccurrenceDependency[]>,
  key: string,
  edge: OccurrenceDependency,
): Record<string, OccurrenceDependency[]> {
  const at = (deps[key] ?? []).filter(
    (d) =>
      d.prerequisiteSeriesId !== edge.prerequisiteSeriesId ||
      d.prerequisiteDate !== edge.prerequisiteDate,
  )
  return { ...deps, [key]: [...at, edge] }
}

/** Without that wait. The day's entry goes when it is waiting on nothing else. */
export function patchRemoveDependency(
  deps: Record<string, OccurrenceDependency[]>,
  key: string,
  prerequisiteSeriesId: string,
  prerequisiteDate: string,
): Record<string, OccurrenceDependency[]> {
  const at = deps[key]
  if (!at) return deps
  const rest = at.filter(
    (d) =>
      d.prerequisiteSeriesId !== prerequisiteSeriesId || d.prerequisiteDate !== prerequisiteDate,
  )
  if (rest.length) return { ...deps, [key]: rest }
  const { [key]: _gone, ...others } = deps
  return others
}
