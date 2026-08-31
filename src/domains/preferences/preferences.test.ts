import { describe, expect, it } from 'vitest'
import { withPersonColor, withTimezone, withWeekLayout, withoutPersonColor } from './patches'
import { personColors, timezone, weekLayout } from './selectors'
import type { Preferences } from './types'

const empty: Preferences = { personColors: {} }
const set: Preferences = {
  personColors: { a: '3', b: '7' },
  timezone: 'Europe/Amsterdam',
  weekLayout: 'timeline',
}

describe('selectors', () => {
  it('falls back to stacked day cards when the layout was never chosen', () => {
    expect(weekLayout(empty)).toBe('list')
    expect(weekLayout(set)).toBe('timeline')
  })

  it('reports no timezone rather than guessing one', () => {
    expect(timezone(empty)).toBeUndefined()
    expect(timezone(set)).toBe('Europe/Amsterdam')
  })

  it('returns the colour overrides as stored', () => {
    expect(personColors(empty)).toEqual({})
    expect(personColors(set)).toEqual({ a: '3', b: '7' })
  })
})

describe('building the next document', () => {
  it('sets one person’s colour, leaving the others', () => {
    expect(withPersonColor(set, 'c', '9').personColors).toEqual({ a: '3', b: '7', c: '9' })
  })

  it('replaces a colour that was already set', () => {
    expect(withPersonColor(set, 'a', '9').personColors).toEqual({ a: '9', b: '7' })
  })

  it('removes one colour so that person falls back to the shared one', () => {
    expect(withoutPersonColor(set, 'a').personColors).toEqual({ b: '7' })
  })

  it('removing a colour nobody set changes nothing', () => {
    expect(withoutPersonColor(set, 'zzz').personColors).toEqual({ a: '3', b: '7' })
  })

  it('keeps the other settings when changing one', () => {
    const next = withWeekLayout(set, 'list')
    expect(next.weekLayout).toBe('list')
    expect(next.timezone).toBe('Europe/Amsterdam')
    expect(next.personColors).toEqual({ a: '3', b: '7' })
  })

  it('records the timezone on a document that had none', () => {
    expect(withTimezone(empty, 'Europe/Bucharest')).toEqual({
      personColors: {},
      timezone: 'Europe/Bucharest',
    })
  })

  it('never modifies the document it was given', () => {
    withPersonColor(set, 'c', '9')
    withoutPersonColor(set, 'a')
    withTimezone(set, 'UTC')
    withWeekLayout(set, 'list')
    expect(set).toEqual({
      personColors: { a: '3', b: '7' },
      timezone: 'Europe/Amsterdam',
      weekLayout: 'timeline',
    })
  })
})
