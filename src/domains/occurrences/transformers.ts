/**
 * Putting the stored rows into the shapes screens read.
 *
 * Used only inside this domain. Sparse rows become one thing per day, looked
 * up by day.
 */
import type { OccurrenceRow } from '../../client/occurrences'
import type { CompletionsMap, OccurrenceState } from './types'

/** The key one day of one event is found under. */
export const occurrenceKey = (eventId: string, date: string): string => `${eventId}:${date}`

/**
 * Every day with something recorded.
 *
 * A row that carries nothing the app shows is left out entirely — clearing a
 * timing override leaves an empty row behind, and an entry for it would read as
 * "something happened here" on a day where nothing did.
 *
 * Two rows can land on the same day. A day's row is stored at the time of day
 * the series had when it was written, so a row written before a time edit sits
 * at the old time while later ones sit at the new one — and the key here is the
 * day alone. Writes avoid making a second row (see `dayRange` in
 * client/occurrences), but a pair written before that rule existed still reads
 * back as two. They are layered rather than replaced, so a day that was
 * cancelled by one row and moved by another keeps both.
 */
export function toCompletions(occurrences: OccurrenceRow[]): CompletionsMap {
  const out: CompletionsMap = {}

  for (const o of occurrences) {
    const key = occurrenceKey(o.seriesId, o.date)
    const entry: OccurrenceState = { ...out[key] }
    if (o.cancelled) entry.cancelled = true
    if (o.start != null) entry.start = o.start
    if (o.duration != null) entry.duration = o.duration
    if (Object.keys(entry).length) out[key] = entry
  }

  return out
}
