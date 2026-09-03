import { describe, expect, it } from 'vitest'
import { DEFAULT_COLOR } from '../../assets/palette'
import { patchRecolor, patchRename } from './patches'
import {
  attendeeLabelFor,
  byId,
  defaultAttendees,
  eventColorKey,
  personColorKey,
} from './selectors'
import type { Person } from './types'

const person = (id: string, name: string, sortOrder: number): Person => ({
  id,
  name,
  color: '1',
  sortOrder,
})

const cris = person('a', 'Cris', 0)
const nora = person('b', 'Nora', 1)
const anna = person('c', 'Anna', 2)
const people = [cris, nora, anna]

describe('byId', () => {
  it('keys everyone by id', () => {
    expect(byId(people)).toEqual({ a: cris, b: nora, c: anna })
  })

  it('is empty for nobody', () => {
    expect(byId([])).toEqual({})
  })
})

describe('attendeeLabelFor', () => {
  it('names people in the order given, however many', () => {
    // No "Both" and no "Everyone": there is no kind of person to collapse.
    expect(attendeeLabelFor(['a', 'b'])(people)).toBe('Cris + Nora')
    expect(attendeeLabelFor(['a', 'b', 'c'])(people)).toBe('Cris + Nora + Anna')
    expect(attendeeLabelFor(['a'])(people)).toBe('Cris')
    expect(attendeeLabelFor(['a', 'c'])(people)).toBe('Cris + Anna')
    expect(attendeeLabelFor(['c', 'a'])(people)).toBe('Anna + Cris')
  })

  it('marks an unknown id rather than dropping it', () => {
    expect(attendeeLabelFor(['a', 'gone'])(people)).toBe('Cris + ?')
  })
})

describe('defaultAttendees', () => {
  it('starts a new event with the first person in lane order', () => {
    expect(defaultAttendees(people)).toEqual(['a'])
    expect(defaultAttendees([anna, cris])).toEqual(['c'])
  })

  it('is empty when there is nobody', () => {
    expect(defaultAttendees([])).toEqual([])
  })
})

describe('personColorKey', () => {
  it('prefers this user, then the shared colour', () => {
    expect(personColorKey(people, { a: '7' }, 'a')).toBe('7')
    expect(personColorKey(people, {}, 'a')).toBe('1')
  })

  it('falls back to the default for leftover hex and unknown people', () => {
    // Colours were once stored as raw hex; one left over must not render as a
    // missing colour.
    expect(personColorKey([{ ...cris, color: '#4f46e5' }], {}, 'a')).toBe(DEFAULT_COLOR)
    expect(personColorKey(people, {}, 'nobody')).toBe(DEFAULT_COLOR)
  })

  it('ignores an override that is not a real colour', () => {
    expect(personColorKey(people, { a: '#bada55' as never }, 'a')).toBe(DEFAULT_COLOR)
  })
})

describe('eventColorKey', () => {
  it('uses the event colour when it has one', () => {
    expect(eventColorKey(people, { a: '7' }, 'a', '3')).toBe('3')
  })

  it('otherwise takes the colour of whoever it sits under', () => {
    expect(eventColorKey(people, { a: '7' }, 'a', undefined)).toBe('7')
    expect(eventColorKey(people, {}, 'a', undefined)).toBe('1')
  })

  it('falls back to the default when it sits under nobody', () => {
    expect(eventColorKey(people, {}, undefined, undefined)).toBe(personColorKey([], {}, 'nobody'))
  })
})

describe('patchRename', () => {
  it('renames one person and leaves the rest alone', () => {
    const next = patchRename(people, 'b', 'Nora W')
    expect(next.map((p) => p.name)).toEqual(['Cris', 'Nora W', 'Anna'])
    expect(next[0]).toBe(cris)
  })

  it('does not change the list for an unknown id', () => {
    expect(patchRename(people, 'nobody', 'X')).toEqual(people)
  })

  it('does not modify the list it was given', () => {
    patchRename(people, 'b', 'Nora W')
    expect(nora.name).toBe('Nora')
  })
})

describe('patchRecolor', () => {
  it('changes one person’s shared colour', () => {
    expect(patchRecolor(people, 'c', '9').map((p) => p.color)).toEqual(['1', '1', '9'])
  })

  it('does not modify the list it was given', () => {
    patchRecolor(people, 'c', '9')
    expect(anna.color).toBe('1')
  })
})
