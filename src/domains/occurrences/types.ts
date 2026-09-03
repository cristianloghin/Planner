/**
 * What happened on one day of a repeating event.
 *
 * An event is a pattern; this is everything that makes one day of it differ —
 * moved, or taken out. The database keeps that as sparse rows. The app wants
 * one thing per day, looked up by day, so this domain owns that shape.
 */

/**
 * One day's state, found under `${eventId}:${date}`.
 *
 * Everything is optional and an absent field means "nothing recorded" — days
 * that match their series have no entry at all.
 */
export interface OccurrenceState {
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
 * Read a window at a time, so start-up stays the same speed however old the
 * account gets.
 */
export type CompletionsMap = Record<string, OccurrenceState>
