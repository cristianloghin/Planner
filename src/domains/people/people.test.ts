import { describe, expect, it } from 'vitest'
import { DEFAULT_COLOR } from '../../assets/palette'
import {
  patchRecolor,
  patchRename,
  withPersonColor,
  withTimezone,
  withoutPersonColor,
} from './patches'
import {
  attendeeLabelFor,
  byId,
  defaultAttendees,
  eventColorIn,
  personColorKey,
  personColorMap,
  personColors,
  timezone,
} from './selectors'
import type { Person, Preferences } from './types'

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

describe('personColorMap', () => {
  it('resolves everyone once, with this user\'s overrides applied', () => {
    expect(personColorMap(people, { a: '7' })).toEqual({ a: '7', b: '1', c: '1' })
    expect(personColorMap([], {})).toEqual({})
  })
})

describe('eventColorIn', () => {
  it('uses the event colour when it has one', () => {
    expect(eventColorIn('7', '3')).toBe('3')
  })

  it('otherwise takes the colour of the lane it sits in', () => {
    expect(eventColorIn('7', undefined)).toBe('7')
  })

  it('falls back to the default when it sits in no lane', () => {
    expect(eventColorIn(undefined, undefined)).toBe(DEFAULT_COLOR)
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

// ---- this user's settings ----

const emptyPrefs: Preferences = { personColors: {} }
const setPrefs: Preferences = {
  personColors: { a: '3', b: '7' },
  timezone: 'Europe/Amsterdam',
}

describe('settings selectors', () => {
  it('reports no timezone rather than guessing one', () => {
    expect(timezone(emptyPrefs)).toBeUndefined()
    expect(timezone(setPrefs)).toBe('Europe/Amsterdam')
  })

  it('returns the colour overrides as stored', () => {
    expect(personColors(emptyPrefs)).toEqual({})
    expect(personColors(setPrefs)).toEqual({ a: '3', b: '7' })
  })
})

describe('building the next settings document', () => {
  it('sets one person’s colour, leaving the others', () => {
    expect(withPersonColor(setPrefs, 'c', '9').personColors).toEqual({ a: '3', b: '7', c: '9' })
  })

  it('replaces a colour that was already set', () => {
    expect(withPersonColor(setPrefs, 'a', '9').personColors).toEqual({ a: '9', b: '7' })
  })

  it('removes one colour so that person falls back to the shared one', () => {
    expect(withoutPersonColor(setPrefs, 'a').personColors).toEqual({ b: '7' })
  })

  it('removing a colour nobody set changes nothing', () => {
    expect(withoutPersonColor(setPrefs, 'zzz').personColors).toEqual({ a: '3', b: '7' })
  })

  it('keeps the other settings when changing one', () => {
    const next = withTimezone(setPrefs, 'UTC')
    expect(next.timezone).toBe('UTC')
    expect(next.personColors).toEqual({ a: '3', b: '7' })
  })

  it('records the timezone on a document that had none', () => {
    expect(withTimezone(emptyPrefs, 'Europe/Bucharest')).toEqual({
      personColors: {},
      timezone: 'Europe/Bucharest',
    })
  })

  it('never modifies the document it was given', () => {
    withPersonColor(setPrefs, 'c', '9')
    withoutPersonColor(setPrefs, 'a')
    withTimezone(setPrefs, 'UTC')
    expect(setPrefs).toEqual({ personColors: { a: '3', b: '7' }, timezone: 'Europe/Amsterdam' })
  })
})
