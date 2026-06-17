import type { Member, MemberId } from '../types'

/** Colour for shared adult ('Both') events — the `--shared` design token. */
export const SHARED_COLOR = 'var(--shared)'

export function byId(members: Member[], id: MemberId): Member | undefined {
  return members.find((m) => m.id === id)
}

export function adults(members: Member[]): Member[] {
  return members.filter((m) => m.role === 'adult')
}

export function isChild(members: Member[], id: MemberId): boolean {
  return byId(members, id)?.role === 'child'
}

export function involvesChild(members: Member[], attendees: MemberId[]): boolean {
  return attendees.some((a) => isChild(members, a))
}

/** An adults-only group of two or more — the classic 'Both' block. */
export function isAdultGroup(members: Member[], attendees: MemberId[]): boolean {
  return attendees.length >= 2 && attendees.every((a) => byId(members, a)?.role === 'adult')
}

/**
 * The colour for an event block. Joint events with a child borrow the child's
 * colour so "kid time" is obvious; an adults-only group uses the shared accent;
 * otherwise the single member's colour.
 */
export function eventColor(members: Member[], attendees: MemberId[]): string {
  const child = attendees.find((a) => isChild(members, a))
  if (child) return byId(members, child)?.color ?? SHARED_COLOR
  if (isAdultGroup(members, attendees)) return SHARED_COLOR
  return byId(members, attendees[0])?.color ?? SHARED_COLOR
}

/** Gradient blending the adults on a shared block. */
export function adultsGradient(members: Member[], attendees: MemberId[]): string {
  const cols = attendees
    .map((a) => byId(members, a)?.color)
    .filter((c): c is string => Boolean(c))
  const a = cols[0] ?? 'var(--accent)'
  const b = cols[1] ?? SHARED_COLOR
  return `linear-gradient(120deg, ${a}, ${b})`
}

/** Short label like "Both", "Cris + Nora", or just "Anna". */
export function attendeeLabel(members: Member[], attendees: MemberId[]): string {
  if (attendees.length === 2 && isAdultGroup(members, attendees)) return 'Both'
  return attendees.map((id) => byId(members, id)?.name ?? '?').join(' + ')
}
