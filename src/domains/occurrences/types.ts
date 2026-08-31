/**
 * What happened on one day of a repeating event.
 *
 * An event is a pattern; this is everything that makes one day of it differ —
 * ticked off, skipped, moved, or taken out. The database keeps that across two
 * tables of sparse rows. The app wants one thing per day, looked up by day, so
 * this domain owns that shape.
 */
export type { OccurrenceStatusCode } from '../../client/occurrences'
import type { OccurrenceStatusCode } from '../../client/occurrences'

/**
 * One day's state, found under `${eventId}:${date}`.
 *
 * Everything is optional and an absent field means "nothing recorded" — days
 * that match their series have no entry at all.
 */
export interface OccurrenceState {
  /**
   * Set explicitly. For an event with no checklist this is how it is marked
   * done; it also carries skipped and blocked. Absent means work it out.
   */
  status?: OccurrenceStatusCode
  /** Which checklist lines are ticked, by line id. */
  checked?: Record<string, boolean>
  /**
   * Moved to, for this day only, in the event's own units. The day itself does
   * not change — only the time within it, and how long it runs.
   */
  start?: string
  duration?: number
  /** Taken out of the series. The pattern still produces it; it is not drawn. */
  cancelled?: boolean
}

/**
 * Every day with something recorded, keyed `${eventId}:${date}`.
 *
 * Read a window at a time. These rows grow with every tick ever made, so they
 * are never all loaded at once.
 */
export type CompletionsMap = Record<string, OccurrenceState>

/**
 * Something one day is waiting on: a particular day of another event, and how
 * far along it has to be.
 *
 * Only the far end is named — these are kept under the day doing the waiting,
 * so that end is already known.
 */
export interface OccurrenceDependency {
  prerequisiteSeriesId: string
  /** The day being waited on, as `yyyy-mm-dd`. */
  prerequisiteDate: string
  requiredStatus: OccurrenceStatusCode
}
