import { describe, it, expect } from 'vitest'
import type { CalendarEvent, Recurrence } from '../types'
import {
  startsOn,
  latestStartOnOrBefore,
  seriesOccurrenceDatesInRange,
  recurrenceLabel,
  occurrencesOnDate,
} from './recurrence'

/** Minimal all-day event factory; the recurrence math only reads start/recurrence. */
function ev(start: string, recurrence?: Recurrence, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title: 'T',
    start,
    allDay: true,
    duration: 1,
    attendees: [],
    attachments: [],
    recurrence,
    ...over,
  }
}

describe('startsOn', () => {
  it('matches only the start day for a one-off', () => {
    const e = ev('2026-06-15')
    expect(startsOn(e, '2026-06-15')).toBe(true)
    expect(startsOn(e, '2026-06-16')).toBe(false)
    expect(startsOn(e, '2026-06-14')).toBe(false)
  })

  it('never produces an occurrence before the start', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1 })
    expect(startsOn(e, '2026-06-14')).toBe(false)
  })

  it('honours a daily interval', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 3 })
    expect(startsOn(e, '2026-06-15')).toBe(true)
    expect(startsOn(e, '2026-06-16')).toBe(false)
    expect(startsOn(e, '2026-06-18')).toBe(true)
    expect(startsOn(e, '2026-06-21')).toBe(true)
  })

  it('honours a weekly interval (same weekday, every N weeks)', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 2 }) // a Monday
    expect(startsOn(e, '2026-06-22')).toBe(false) // +1 week
    expect(startsOn(e, '2026-06-29')).toBe(true) // +2 weeks
    expect(startsOn(e, '2026-06-16')).toBe(false) // wrong weekday
  })

  it('honours a monthly interval on the anchor day-of-month', () => {
    const e = ev('2026-01-15', { freq: 'monthly', interval: 2 })
    expect(startsOn(e, '2026-02-15')).toBe(false) // +1 month
    expect(startsOn(e, '2026-03-15')).toBe(true) // +2 months
    expect(startsOn(e, '2026-03-14')).toBe(false) // wrong day-of-month
  })

  it('skips months without the anchor day-of-month (Jan 31 -> no Feb)', () => {
    const e = ev('2026-01-31', { freq: 'monthly', interval: 1 })
    expect(startsOn(e, '2026-02-28')).toBe(false) // Feb has no 31st: skipped, not clamped
    expect(startsOn(e, '2026-03-31')).toBe(true)
  })

  it('produces nothing after an inclusive UNTIL cap', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1, until: '2026-06-17' })
    expect(startsOn(e, '2026-06-17')).toBe(true) // inclusive
    expect(startsOn(e, '2026-06-18')).toBe(false)
  })
})

describe('latestStartOnOrBefore', () => {
  it('returns null before the first occurrence', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1 })
    expect(latestStartOnOrBefore(e, '2026-06-14')).toBeNull()
  })

  it('finds the most recent daily slot on or before a date', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 3 })
    expect(latestStartOnOrBefore(e, '2026-06-20')).toBe('2026-06-18')
    expect(latestStartOnOrBefore(e, '2026-06-18')).toBe('2026-06-18')
  })

  it('finds the most recent weekly slot', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 2 })
    expect(latestStartOnOrBefore(e, '2026-07-01')).toBe('2026-06-29')
  })

  it('clamps the query to the series UNTIL cap', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1, until: '2026-06-17' })
    expect(latestStartOnOrBefore(e, '2026-06-30')).toBe('2026-06-17')
  })

  it('skips overflow months when walking back monthly slots', () => {
    const e = ev('2026-01-31', { freq: 'monthly', interval: 1 })
    // Querying within Feb walks back to Jan 31 (Feb itself is skipped).
    expect(latestStartOnOrBefore(e, '2026-02-15')).toBe('2026-01-31')
  })
})

describe('seriesOccurrenceDatesInRange', () => {
  it('lists every slot in an inclusive range', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    expect(seriesOccurrenceDatesInRange(e, '2026-06-15', '2026-07-06')).toEqual([
      '2026-06-15',
      '2026-06-22',
      '2026-06-29',
      '2026-07-06',
    ])
  })

  it('respects the UNTIL cap inside a range', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1, until: '2026-06-25' })
    expect(seriesOccurrenceDatesInRange(e, '2026-06-15', '2026-07-06')).toEqual([
      '2026-06-15',
      '2026-06-22',
    ])
  })
})

describe('recurrenceLabel', () => {
  it('describes the cadence', () => {
    expect(recurrenceLabel()).toBe('Does not repeat')
    expect(recurrenceLabel({ freq: 'weekly', interval: 1 })).toBe('Every week')
    expect(recurrenceLabel({ freq: 'daily', interval: 3 })).toBe('Every 3 days')
    expect(recurrenceLabel({ freq: 'monthly', interval: 2 })).toBe('Every 2 months')
  })
})

describe('occurrencesOnDate', () => {
  it('places a recurring all-day occurrence on its slot only', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    expect(occurrencesOnDate([e], '2026-06-15')).toHaveLength(1)
    expect(occurrencesOnDate([e], '2026-06-16')).toHaveLength(0)
    expect(occurrencesOnDate([e], '2026-06-22')).toHaveLength(1)
  })

  it('hides a cancelled occurrence but keeps the others', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    const completions = { 'e1:2026-06-22': { cancelled: true } }
    expect(occurrencesOnDate([e], '2026-06-22', completions)).toHaveLength(0)
    expect(occurrencesOnDate([e], '2026-06-15', completions)).toHaveLength(1)
  })

  it('renders a relocated occurrence on its new day with its original identity', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    const completions = { 'e1:2026-06-15': { start: '2026-06-17' } }
    // Gone from its original day...
    expect(occurrencesOnDate([e], '2026-06-15', completions)).toHaveLength(0)
    // ...present on the moved day, keyed by the original slot.
    const moved = occurrencesOnDate([e], '2026-06-17', completions)
    expect(moved).toHaveLength(1)
    expect(moved[0].start).toBe('2026-06-15')
    expect(moved[0].moved).toBe(true)
  })
})
