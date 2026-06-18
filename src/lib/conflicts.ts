import type { PersonId } from '../types'
import { PARENT_IDS } from './people'

/**
 * 'covered' — a parent is on the event with Nora.
 * 'needs'   — Nora is on her own, but at least one parent is free to take her.
 * 'clash'   — Nora is on her own and both parents are busy: nobody can be with her.
 */
export type KidStatus = 'covered' | 'needs' | 'clash'

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

/** Coverage status for every Nora block on a given day, keyed by block id. */
export function kidStatuses(dayEvents: Busy[]): Map<string, KidStatus> {
  const result = new Map<string, KidStatus>()
  const kidEvents = dayEvents.filter((e) => e.attendees.includes('kid'))

  for (const k of kidEvents) {
    const hasParent = k.attendees.some((a) => a === 'me' || a === 'partner')
    if (hasParent) {
      result.set(k.id, 'covered')
      continue
    }
    const freeParents = PARENT_IDS.filter(
      (p) => !dayEvents.some((e) => e.id !== k.id && e.attendees.includes(p) && overlaps(e, k)),
    )
    result.set(k.id, freeParents.length > 0 ? 'needs' : 'clash')
  }
  return result
}
