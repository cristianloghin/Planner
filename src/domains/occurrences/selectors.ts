/**
 * Ways for a screen to ask about one day.
 *
 * Note the difference from other domains. `useDependencies` takes a selector
 * like the rest. `useCompletionsForRange` does not — it merges several months
 * into one object, so there is nothing to hand a selector to. Call these
 * directly on what it returns instead.
 *
 * What a day's state MEANS — whether it counts as done, whether it is held up
 * by another day — is not here. That is worked out from the event's checklist
 * and its repeat rule together, which is a job of its own; feed it these.
 */
import { occurrenceKey } from './transformers'
import type { CompletionsMap, OccurrenceDependency, OccurrenceState } from './types'

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

/** What one day is waiting on. Empty when it is waiting on nothing. */
export function waitsFor(eventId: string, date: string) {
  return (deps: Record<string, OccurrenceDependency[]>): OccurrenceDependency[] =>
    deps[occurrenceKey(eventId, date)] ?? []
}
