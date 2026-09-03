/**
 * What one day looks like the moment something is recorded against it, before
 * the server has confirmed it.
 *
 * Pure, so the rules a screen shows instantly can be tested without a database
 * or a cache. These mirror what the server does, including the part that is
 * easy to miss: a day left with nothing recorded has no entry at all, matching
 * the read, which leaves such rows out.
 */
import type { PersonId } from '../people/types'
import type { OccurrenceState } from './types'

/** Every change to one day, as one set of values that can be written down. */
export type OccurrenceChange =
  | { kind: 'override'; start: string; duration: number }
  | { kind: 'clearOverride' }
  | { kind: 'attendees'; attendees: PersonId[] }
  | { kind: 'clearAttendees' }
  | { kind: 'cancel' }

/**
 * One day's state with `change` applied.
 *
 * Clearing a timing override keeps everything else on the day — it may also
 * have been taken out — which is exactly what the write does.
 */
export function patchEntry(
  entry: OccurrenceState | undefined,
  change: OccurrenceChange,
): OccurrenceState {
  switch (change.kind) {
    case 'override':
      return { ...entry, start: change.start, duration: change.duration }
    case 'clearOverride': {
      const { start: _s, duration: _d, ...rest } = entry ?? {}
      return rest
    }
    case 'attendees':
      return { ...entry, attendees: change.attendees }
    case 'clearAttendees': {
      const { attendees: _a, ...rest } = entry ?? {}
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
