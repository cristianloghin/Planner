import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Recurrence } from '../../domains/events/types'
import {
  nextStartOnOrAfter,
  occurrenceIndex,
  occurrencesOnDate,
  recurrenceLabel,
  startsOn,
} from './expand'

/** Minimal all-day event factory; the recurrence math only reads start/recurrence. */
function ev(
  start: string,
  recurrence?: Recurrence,
  over: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: 'e1',
    title: 'T',
    start,
    allDay: true,
    duration: 1,
    attendees: [],
    reminders: [],
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

describe('nextStartOnOrAfter', () => {
  it('returns the anchor when it is on or after the date', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1 })
    expect(nextStartOnOrAfter(e, '2026-06-10')).toBe('2026-06-15')
    expect(nextStartOnOrAfter(e, '2026-06-15')).toBe('2026-06-15')
  })

  it('finds the next daily slot after a past anchor', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 3 })
    expect(nextStartOnOrAfter(e, '2026-06-16')).toBe('2026-06-18')
    expect(nextStartOnOrAfter(e, '2026-06-18')).toBe('2026-06-18')
  })

  it('finds the next weekly slot', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 2 })
    expect(nextStartOnOrAfter(e, '2026-06-23')).toBe('2026-06-29')
  })

  it('returns null for a one-off whose only slot has passed', () => {
    const e = ev('2026-06-15')
    expect(nextStartOnOrAfter(e, '2026-06-16')).toBeNull()
    expect(nextStartOnOrAfter(e, '2026-06-15')).toBe('2026-06-15')
  })

  it('returns null once the series UNTIL cap has passed', () => {
    const e = ev('2026-06-15', { freq: 'daily', interval: 1, until: '2026-06-17' })
    expect(nextStartOnOrAfter(e, '2026-06-17')).toBe('2026-06-17')
    expect(nextStartOnOrAfter(e, '2026-06-18')).toBeNull()
  })
})

describe('occurrenceIndex', () => {
  it('numbers daily and weekly slots by plain division', () => {
    const daily = ev('2026-06-15', { freq: 'daily', interval: 3 })
    expect(occurrenceIndex(daily, '2026-06-15')).toBe(0)
    expect(occurrenceIndex(daily, '2026-06-18')).toBe(1)
    expect(occurrenceIndex(daily, '2026-06-16')).toBeNull() // off-grid
    const weekly = ev('2026-06-15', { freq: 'weekly', interval: 2 })
    expect(occurrenceIndex(weekly, '2026-06-29')).toBe(1)
    expect(occurrenceIndex(weekly, '2026-06-22')).toBeNull()
  })

  it('is null before the anchor, and 0 on it for a one-off', () => {
    expect(occurrenceIndex(ev('2026-06-15'), '2026-06-15')).toBe(0)
    expect(occurrenceIndex(ev('2026-06-15'), '2026-06-14')).toBeNull()
    expect(occurrenceIndex(ev('2026-06-15'), '2026-06-16')).toBeNull()
  })

  it('counts only months that produce a slot, so a skipped Feb costs nothing', () => {
    // Anchored on the 31st: February produces nothing and must not consume one
    // of a counted series' N, or "12 lessons on the 31st" yields fewer than 12.
    const e = ev('2026-01-31', { freq: 'monthly', interval: 1 })
    expect(occurrenceIndex(e, '2026-01-31')).toBe(0)
    expect(occurrenceIndex(e, '2026-03-31')).toBe(1) // NOT 2 — Feb was skipped
    expect(occurrenceIndex(e, '2026-05-31')).toBe(2) // April has no 31st either
  })
})

describe('startsOn with a count', () => {
  it('stops after the Nth slot', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1, count: 3 })
    expect(startsOn(e, '2026-06-15')).toBe(true) // 1st
    expect(startsOn(e, '2026-06-22')).toBe(true) // 2nd
    expect(startsOn(e, '2026-06-29')).toBe(true) // 3rd
    expect(startsOn(e, '2026-07-06')).toBe(false) // there is no 4th
  })

  it('counts slots, not survivors — cancelling one does not extend the series', () => {
    // startsOn knows nothing of cancellations by design: the grid is the grid,
    // so the 4th week is off it whether or not the 2nd was cancelled.
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1, count: 3 })
    expect(startsOn(e, '2026-07-06')).toBe(false)
  })

  it('takes whichever of count and until comes first', () => {
    const countFirst = ev('2026-06-15', {
      freq: 'daily',
      interval: 1,
      count: 2,
      until: '2026-06-30',
    })
    expect(startsOn(countFirst, '2026-06-16')).toBe(true)
    expect(startsOn(countFirst, '2026-06-17')).toBe(false) // count ran out first

    const untilFirst = ev('2026-06-15', {
      freq: 'daily',
      interval: 1,
      count: 30,
      until: '2026-06-16',
    })
    expect(startsOn(untilFirst, '2026-06-16')).toBe(true)
    expect(startsOn(untilFirst, '2026-06-17')).toBe(false) // until ran out first
  })

  it('ends the forward scan at the last counted slot', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1, count: 2 })
    expect(nextStartOnOrAfter(e, '2026-06-16')).toBe('2026-06-22')
    expect(nextStartOnOrAfter(e, '2026-06-23')).toBeNull()
  })
})

describe('recurrenceLabel', () => {
  it('describes the cadence', () => {
    expect(recurrenceLabel()).toBe('Does not repeat')
    expect(recurrenceLabel(ev('2026-06-15', { freq: 'daily', interval: 3 }))).toBe('Every 3 days')
    expect(recurrenceLabel(ev('2026-06-15', { freq: 'monthly', interval: 2 }))).toBe(
      'Every 2 months',
    )
  })

  it('names the weekday for a weekly rule, which is never stored', () => {
    // 2026-06-15 is a Monday; the weekday comes from the anchor alone.
    expect(recurrenceLabel(ev('2026-06-15', { freq: 'weekly', interval: 1 }))).toBe(
      'Every week on Mon',
    )
    expect(recurrenceLabel(ev('2026-06-16', { freq: 'weekly', interval: 2 }))).toBe(
      'Every 2 weeks on Tue',
    )
  })

  it('says how the series ends', () => {
    expect(recurrenceLabel(ev('2026-06-16', { freq: 'weekly', interval: 2, count: 12 }))).toBe(
      'Every 2 weeks on Tue · 12 times',
    )
    expect(
      recurrenceLabel(ev('2026-06-15', { freq: 'weekly', interval: 1, until: '2026-12-25' })),
    ).toMatch(/^Every week on Mon · until /)
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

  it('still renders a stretched earlier occurrence when a nearer slot is cancelled', () => {
    // Weekly all-day; the 06-15 occurrence is stretched to 8 days (covers 06-22),
    // and the separate 06-22 occurrence is cancelled. The cancelled slot must not
    // abort the back-scan that finds 06-15's tail on 06-22.
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    const completions = {
      'e1:2026-06-15': { duration: 8 },
      'e1:2026-06-22': { cancelled: true },
    }
    const occs = occurrencesOnDate([e], '2026-06-22', completions)
    expect(occs).toHaveLength(1)
    expect(occs[0].start).toBe('2026-06-15')
    expect(occs[0].offset).toBe(7)
    expect(occs[0].span).toBe(8)
  })

  it('still renders a stretched earlier occurrence when a nearer slot moved away', () => {
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    const completions = {
      'e1:2026-06-15': { duration: 8 },
      'e1:2026-06-22': { start: '2026-06-25' }, // relocated off its slot
    }
    const occs = occurrencesOnDate([e], '2026-06-22', completions)
    expect(occs).toHaveLength(1)
    expect(occs[0].start).toBe('2026-06-15')
  })

  it('accounts for a start-only override that pushes a timed occurrence past midnight', () => {
    // 23:30 + 2h crosses into the next day; the back-scan must widen even though
    // only `start` (not `duration`) is overridden.
    const e = ev(
      '2026-06-15T10:00',
      { freq: 'weekly', interval: 1 },
      { allDay: false, duration: 120 },
    )
    const completions = { 'e1:2026-06-15': { start: '2026-06-15T23:30' } }
    const nextDay = occurrencesOnDate([e], '2026-06-16', completions)
    expect(nextDay).toHaveLength(1)
    expect(nextDay[0].start).toBe('2026-06-15')
    expect(nextDay[0].segment).toEqual({ start: 0, end: 90 })
  })

  it('does not ghost-render a relocation whose origin slot the rule no longer produces', () => {
    // Override written while the slot existed; the series has since changed so
    // 2026-06-16 is no longer a slot (weekly from 06-15).
    const e = ev('2026-06-15', { freq: 'weekly', interval: 1 })
    const completions = { 'e1:2026-06-16': { start: '2026-06-18' } }
    expect(occurrencesOnDate([e], '2026-06-18', completions)).toHaveLength(0)
  })
})
