import { describe, expect, it } from 'vitest'
import type { Recurrence } from '../types'
import { recurrenceToRRule, rruleToRecurrence } from './rrule'

describe('recurrenceToRRule', () => {
  it('returns null for a one-off', () => {
    expect(recurrenceToRRule(undefined)).toBeNull()
  })

  it('serializes a bare rule without the RRULE: prefix', () => {
    const s = recurrenceToRRule({ freq: 'weekly', interval: 2 })
    expect(s).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(s).not.toMatch(/COUNT|UNTIL/)
  })

  it('encodes UNTIL when the recurrence ends on a date', () => {
    const s = recurrenceToRRule({ freq: 'daily', interval: 1, until: '2026-06-17' })
    expect(s).toMatch(/UNTIL=/)
  })

  it('encodes COUNT when the recurrence ends after a number of times', () => {
    expect(recurrenceToRRule({ freq: 'weekly', interval: 2, count: 5 })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;COUNT=5',
    )
  })

  it('round-trips both kinds of end', () => {
    for (const r of [
      { freq: 'weekly', interval: 2, count: 5 },
      { freq: 'daily', interval: 1, until: '2026-06-17' },
    ] as const) {
      expect(rruleToRecurrence(recurrenceToRRule(r))).toEqual(r)
    }
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

  it('reads a COUNT rule back as a count', () => {
    expect(rruleToRecurrence('FREQ=DAILY;COUNT=5')).toEqual({
      freq: 'daily',
      interval: 1,
      count: 5,
    })
  })

  it('treats an unmodelled frequency as a one-off rather than crashing', () => {
    expect(rruleToRecurrence('FREQ=YEARLY')).toBeUndefined()
  })
})
