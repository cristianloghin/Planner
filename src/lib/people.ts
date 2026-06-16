import type { AppState, Attendee } from '../types'

/** Colour used for shared ('both') events where a single colour is needed. */
export const SHARED_COLOR = '#a855f7'

export function attendeeName(state: AppState, id: Attendee): string {
  return id === 'both' ? 'Both' : state.people[id].name
}

export function attendeeColor(state: AppState, id: Attendee): string {
  return id === 'both' ? SHARED_COLOR : state.people[id].color
}

/** A CSS background for an attendee: a flat colour, or a gradient for 'both'. */
export function attendeeBackground(state: AppState, id: Attendee): string {
  if (id !== 'both') return state.people[id].color
  return `linear-gradient(120deg, ${state.people.me.color}, ${state.people.partner.color})`
}
