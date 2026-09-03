/**
 * Ways for a screen to ask about one day.
 *
 * Note the difference from other domains. `useCompletionsForRange` takes no
 * selector — it merges several months into one object, so there is nothing to
 * hand a selector to. Call these directly on what it returns instead.
 *
 * A day's state is only ever what was recorded against it: whether it moved,
 * and whether it was taken out.
 */
import { occurrenceKey } from './transformers'
import type { CompletionsMap, OccurrenceState } from './types'

/**
 * What was recorded against one day, or undefined if nothing was.
 *
 * Undefined is the normal case: a day that matches its series has no entry.
 */
export function stateFor(eventId: string, date: string) {
  return (completions: CompletionsMap): OccurrenceState | undefined =>
    completions[occurrenceKey(eventId, date)]
}

/** Whether one day has been taken out of its series. */
export function isCancelled(eventId: string, date: string) {
  return (completions: CompletionsMap): boolean =>
    completions[occurrenceKey(eventId, date)]?.cancelled === true
}
