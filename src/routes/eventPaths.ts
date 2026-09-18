import type { EditScope } from '../domains/events/draft'
import type { PersonId } from '../types'

/** Times snap to this; a tap on empty space makes an hour-long event. */
const SNAP = 15
const DAY_MIN = 24 * 60

/**
 * URL for a new event: the day, optionally who is on it and its time. With no
 * attendees the editor route picks the default (the first person).
 */
export function newEventPath(seed: {
  date: string
  attendees?: PersonId[]
  startMin?: number
  endMin?: number
  allDay?: boolean
}): string {
  const q = new URLSearchParams({ date: seed.date })
  for (const id of seed.attendees ?? []) q.append('for', id)
  if (seed.startMin != null) q.set('at', String(seed.startMin))
  if (seed.endMin != null) q.set('end', String(seed.endMin))
  if (seed.allDay) q.set('allDay', 'true')
  return `/event/new?${q}`
}

/** URL for a new event from a tap on a timeline at `minute`: snapped, an hour long. */
export function newEventAtPath(date: string, minute: number, attendees?: PersonId[]): string {
  const startMin = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
  return newEventPath({ date, attendees, startMin, endMin: Math.min(startMin + 60, DAY_MIN) })
}

/**
 * URL for editing a series, or part of one. `date` is the day the editor was
 * opened from, so closing can return there; the form itself shows the series.
 * A narrower `scope` — one occurrence, or one and every one after it — is
 * about that day, so it needs one.
 */
export function editEventPath(id: string, date?: string, scope: EditScope = 'series'): string {
  const q = new URLSearchParams()
  if (date) q.set('date', date)
  if (date && scope !== 'series') q.set('scope', scope)
  const qs = q.toString()
  return `/event/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
}
