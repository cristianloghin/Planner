import { describe, expect, it } from 'vitest'
import type { Recurrence } from '../types'
import { recurrenceToRRule, rruleToRecurrence, truncatedRRule } from './rrule'

describe('recurrenceToRRule', () => {
  it('returns null for a one-off', () => {
    expect(recurrenceToRRule(undefined)).toBeNull()
  })

  it('serializes a bare rule without the RRULE: prefix or a COUNT', () => {
    const s = recurrenceToRRule({ freq: 'weekly', interval: 2 })
    expect(s).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(s).not.toMatch(/COUNT/)
  })

  it('encodes UNTIL when the recurrence is capped', () => {
    const s = recurrenceToRRule({ freq: 'daily', interval: 1, until: '2026-06-17' })
    expect(s).toMatch(/UNTIL=/)
  })
})

describe('round-trip recurrenceToRRule <-> rruleToRecurrence', () => {
  const cases: Recurrence[] = [
    { freq: 'daily', interval: 1 },
    { freq: 'weekly', interval: 2 },
    { freq: 'monthly', interval: 3 },
    { freq: 'weekly', interval: 1, until: '2026-06-17' },
    { freq: 'monthly', interval: 2, until: '2026-12-31' },
  ]
  for (const r of cases) {
    it(`preserves ${JSON.stringify(r)}`, () => {
      const round = rruleToRecurrence(recurrenceToRRule(r))
      expect(round).toEqual(r)
    })
  }
})

describe('rruleToRecurrence', () => {
  it('maps an empty/null rule to undefined (a one-off)', () => {
    expect(rruleToRecurrence(null)).toBeUndefined()
    expect(rruleToRecurrence('')).toBeUndefined()
  })

  it('defaults a missing interval to 1', () => {
    expect(rruleToRecurrence('FREQ=DAILY')).toEqual({ freq: 'daily', interval: 1 })
  })

  it('throws on a forbidden COUNT rule (Decision 2 invariant)', () => {
    expect(() => rruleToRecurrence('FREQ=DAILY;COUNT=5')).toThrow(/COUNT/)
  })

  it('treats an unmodelled frequency as a one-off rather than crashing', () => {
    expect(rruleToRecurrence('FREQ=YEARLY')).toBeUndefined()
  })
})

describe('truncatedRRule', () => {
  it('caps the rule at the day before the split (split day belongs to the new series)', () => {
    const r: Recurrence = { freq: 'weekly', interval: 1 }
    const trimmed = truncatedRRule(r, '2026-06-22')
    // The truncated rule must reload with an UNTIL of 2026-06-21.
    expect(rruleToRecurrence(trimmed)).toEqual({ freq: 'weekly', interval: 1, until: '2026-06-21' })
  })
})
