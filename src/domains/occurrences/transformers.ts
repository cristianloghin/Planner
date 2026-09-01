/**
 * Putting the stored rows into the shapes screens read.
 *
 * Used only inside this domain. Two tables of sparse rows become one thing per
 * day, looked up by day.
 */
import type { DependencyRow, ItemStateRow, OccurrenceRow } from '../../client/occurrences'
import type { CompletionsMap, OccurrenceDependency, OccurrenceState } from './types'

/** The key one day of one event is found under. */
export const occurrenceKey = (eventId: string, date: string): string => `${eventId}:${date}`

/**
 * Every day with something recorded, from the two tables that hold it.
 *
 * A row that carries nothing the app shows is left out entirely — clearing a
 * status can leave an empty row behind, and an entry for it would read as
 * "something happened here" on a day where nothing did.
 *
 * Two rows can land on the same day. A day's row is stored at the time of day
 * the series had when it was written, so a row written before a time edit sits
 * at the old time while later ones sit at the new one — and the key here is the
 * day alone. Writes avoid making a second row (see `dayRange` in
 * client/occurrences), but a pair written before that rule existed still reads
 * back as two. They are layered rather than replaced, so a day that was marked
 * done by one row and moved by another keeps both.
 */
export function toCompletions(
  occurrences: OccurrenceRow[],
  itemStates: ItemStateRow[],
): CompletionsMap {
  const out: CompletionsMap = {}

  for (const o of occurrences) {
    const key = occurrenceKey(o.seriesId, o.date)
    const entry: OccurrenceState = { ...out[key] }
    if (o.status) entry.status = o.status
    if (o.cancelled) entry.cancelled = true
    if (o.start != null) entry.start = o.start
    if (o.duration != null) entry.duration = o.duration
    if (Object.keys(entry).length) out[key] = entry
  }

  for (const it of itemStates) {
    const key = occurrenceKey(it.seriesId, it.date)
    const at = out[key]
    out[key] = { ...at, checked: { ...at?.checked, [it.itemId]: it.done } }
  }

  return out
}

/**
 * What every day is waiting on, kept under the day doing the waiting.
 *
 * Keyed the same way as {@link toCompletions}, so a screen showing one day
 * reads both with the same string.
 */
export function dependenciesByOccurrence(
  rows: DependencyRow[],
): Record<string, OccurrenceDependency[]> {
  const out: Record<string, OccurrenceDependency[]> = {}
  for (const row of rows) {
    const key = occurrenceKey(row.dependentSeriesId, row.dependentDate)
    const at = out[key]
    const edge: OccurrenceDependency = {
      prerequisiteSeriesId: row.prerequisiteSeriesId,
      prerequisiteDate: row.prerequisiteDate,
      requiredStatus: row.requiredStatus,
    }
    if (at) at.push(edge)
    else out[key] = [edge]
  }
  return out
}
