import type { CalendarEvent, Member } from '../types'

/**
 * 'covered' — an adult is on the event with the child.
 * 'needs'   — the child is on their own, but at least one adult is free to take them.
 * 'clash'   — the child is on their own and every adult is busy: nobody can be with them.
 */
export type CoverageStatus = 'covered' | 'needs' | 'clash'

function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.start < b.end && b.start < a.end
}

/** Coverage status for every child event on a given day, keyed by event id. */
export function childStatuses(
  members: Member[],
  dayEvents: CalendarEvent[],
): Map<string, CoverageStatus> {
  const adultIds = members.filter((m) => m.role === 'adult').map((m) => m.id)
  const childIds = new Set(members.filter((m) => m.role === 'child').map((m) => m.id))

  const result = new Map<string, CoverageStatus>()
  const childEvents = dayEvents.filter((e) => e.attendees.some((a) => childIds.has(a)))

  for (const k of childEvents) {
    const hasAdult = k.attendees.some((a) => adultIds.includes(a))
    if (hasAdult) {
      result.set(k.id, 'covered')
      continue
    }
    const freeAdults = adultIds.filter(
      (p) => !dayEvents.some((e) => e.id !== k.id && e.attendees.includes(p) && overlaps(e, k)),
    )
    result.set(k.id, freeAdults.length > 0 ? 'needs' : 'clash')
  }
  return result
}
