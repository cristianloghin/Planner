import { describe, expect, it } from 'vitest'
import { addDays } from '../../assets/utils/dates'
import type { CalendarEvent, Recurrence } from '../../domains/events/types'
import { startsOn } from './expand'
import { recurrenceEndingBefore, recurrenceFrom } from './split'

function ev(start: string, recurrence?: Recurrence): CalendarEvent {
  return {
    id: 'e1',
    title: 'T',
    start,
    allDay: true,
    duration: 1,
    attendees: [],
    reminders: [],
    recurrence,
  }
}

/** The days `e` produces in a window, for comparing halves against the whole. */
function daysOf(e: CalendarEvent, from: string, count: number): string[] {
  const out: string[] = []
  for (let d = from, i = 0; i < count; d = addDays(d, 1), i++) if (startsOn(e, d)) out.push(d)
  return out
}

describe('recurrenceEndingBefore', () => {
  it('ends the day before the cut, keeping the cadence', () => {
    expect(recurrenceEndingBefore({ freq: 'weekly', interval: 2 }, '2026-06-22')).toEqual({
      freq: 'weekly',
      interval: 2,
      until: '2026-06-21',
    })
  })

  it('replaces a count with the cap rather than keeping both', () => {
    expect(recurrenceEndingBefore({ freq: 'daily', interval: 1, count: 10 }, '2026-06-04')).toEqual(
      {
        freq: 'daily',
        interval: 1,
        until: '2026-06-03',
      },
    )
  })

  it('moves an existing last day back to the cut', () => {
    expect(
      recurrenceEndingBefore({ freq: 'daily', interval: 1, until: '2026-12-31' }, '2026-06-04'),
    ).toEqual({ freq: 'daily', interval: 1, until: '2026-06-03' })
  })
})

describe('recurrenceFrom', () => {
  it('is nothing for a one-off', () => {
    expect(recurrenceFrom(ev('2026-06-01'), '2026-06-01')).toBeUndefined()
  })

  it('keeps a rule with no end, and one ending on a date', () => {
    const open = { freq: 'weekly', interval: 1 } as const
    expect(recurrenceFrom(ev('2026-06-01', open), '2026-06-15')).toEqual(open)
    const capped = { freq: 'weekly', interval: 1, until: '2026-12-31' } as const
    expect(recurrenceFrom(ev('2026-06-01', capped), '2026-06-15')).toEqual(capped)
  })

  it('leaves the count what remains after the days before the cut', () => {
    // A Monday, every two weeks, eight times; cut at the fourth (index 3).
    const e = ev('2026-06-01', { freq: 'weekly', interval: 2, count: 8 })
    expect(recurrenceFrom(e, '2026-07-13')).toEqual({ freq: 'weekly', interval: 2, count: 5 })
  })

  it('counts produced months only when the day-of-month skips some', () => {
    // On the 31st: January, March, May... February and April produce nothing
    // and must not be counted as used up.
    const e = ev('2026-01-31', { freq: 'monthly', interval: 1, count: 12 })
    expect(recurrenceFrom(e, '2026-05-31')).toEqual({ freq: 'monthly', interval: 1, count: 10 })
  })

  it('keeps the count whole for a day the rule does not produce', () => {
    const e = ev('2026-06-01', { freq: 'weekly', interval: 1, count: 8 })
    expect(recurrenceFrom(e, '2026-06-03')).toEqual({ freq: 'weekly', interval: 1, count: 8 })
  })
})

describe('the two halves together', () => {
  it.each([
    ['counted', { freq: 'daily', interval: 3, count: 10 } as Recurrence, '2026-06-13'],
    ['capped', { freq: 'weekly', interval: 1, until: '2026-08-10' } as Recurrence, '2026-07-06'],
    ['open', { freq: 'daily', interval: 1 } as Recurrence, '2026-06-20'],
    [
      'monthly, skipping months',
      { freq: 'monthly', interval: 1, count: 6 } as Recurrence,
      '2026-05-31',
    ],
  ])('produce exactly the days the whole did (%s)', (_name, recurrence, cut) => {
    const anchor = recurrence.freq === 'monthly' ? '2026-01-31' : '2026-06-01'
    const whole = ev(anchor, recurrence)
    const before = ev(anchor, recurrenceEndingBefore(recurrence, cut))
    const after = ev(cut, recurrenceFrom(whole, cut))
    const window = 400
    const halves = [...daysOf(before, anchor, window), ...daysOf(after, anchor, window)]
    expect(halves).toEqual(daysOf(whole, anchor, window))
    // And the cut day itself belongs to the second half alone.
    expect(startsOn(before, cut)).toBe(false)
    expect(startsOn(after, cut)).toBe(true)
  })
})
