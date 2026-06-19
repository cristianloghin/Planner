import type { Person, PersonId } from '../types'

/**
 * Supervision status for a child's block:
 *  'covered' — an adult is on the event with the child.
 *  'needs'   — the child is alone, but at least one adult is free to take them.
 *  'clash'   — the child is alone and every adult is busy: nobody can supervise.
 */
export type ChildStatus = 'covered' | 'needs' | 'clash'

/** A time block on a single day: minutes from midnight, who's on it. */
export interface Busy {
  id: string
  attendees: PersonId[]
  start: number
  end: number
}

function overlaps(a: Busy, b: Busy): boolean {
  return a.start < b.end && b.start < a.end
}

/** Supervision status for every child block on a given day, keyed by block id. */
export function childStatuses(
  dayEvents: Busy[],
  people: Record<string, Person>,
): Map<string, ChildStatus> {
  const result = new Map<string, ChildStatus>()
  const isChild = (id: PersonId) => people[id]?.kind === 'child'
  const adultIds = Object.values(people)
    .filter((p) => p.kind === 'adult')
    .map((p) => p.id)
  const childEvents = dayEvents.filter((e) => e.attendees.some(isChild))

  for (const c of childEvents) {
    const hasAdult = c.attendees.some((a) => people[a]?.kind === 'adult')
    if (hasAdult) {
      result.set(c.id, 'covered')
      continue
    }
    const freeAdults = adultIds.filter(
      (p) => !dayEvents.some((e) => e.id !== c.id && e.attendees.includes(p) && overlaps(e, c)),
    )
    result.set(c.id, freeAdults.length > 0 ? 'needs' : 'clash')
  }
  return result
}
