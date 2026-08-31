import { describe, expect, it } from 'vitest'
import {
  dayRange,
  durationToInterval,
  intervalToDuration,
  intervalToMinutes,
  occurrenceTs,
  startToTs,
  tsToDateKey,
  tsToStart,
} from './mappers'

describe('intervalToMinutes', () => {
  it('parses Postgres interval text', () => {
    expect(intervalToMinutes('01:30:00')).toBe(90)
    expect(intervalToMinutes('00:45:00')).toBe(45)
    expect(intervalToMinutes('2 days')).toBe(2 * 24 * 60)
    expect(intervalToMinutes('1 day 02:30:00')).toBe(24 * 60 + 150)
  })

  it('parses ISO-8601 durations', () => {
    expect(intervalToMinutes('PT1H30M')).toBe(90)
    expect(intervalToMinutes('P2D')).toBe(2 * 24 * 60)
    expect(intervalToMinutes('P1DT2H30M')).toBe(24 * 60 + 150)
  })

  it('parses an hour count wider than two digits', () => {
    // The time regex is end-anchored precisely so this doesn't truncate to 00:00.
    expect(intervalToMinutes('100:00:00')).toBe(6000)
  })

  it('treats null and empty as zero', () => {
    expect(intervalToMinutes(null)).toBe(0)
    expect(intervalToMinutes('')).toBe(0)
  })
})

describe('intervalToDuration', () => {
  it('returns minutes for a timed event', () => {
    expect(intervalToDuration('01:30:00', false)).toBe(90)
  })

  it('returns whole days for an all-day event', () => {
    expect(intervalToDuration('2 days', true)).toBe(2)
    expect(intervalToDuration('1 day', true)).toBe(1)
  })

  it('never yields a zero-length all-day event', () => {
    expect(intervalToDuration(null, true)).toBe(1)
    expect(intervalToDuration('00:00:00', true)).toBe(1)
  })
})

describe('durationToInterval', () => {
  it('writes the unit the allDay flag implies', () => {
    expect(durationToInterval(90, false)).toBe('90 minutes')
    expect(durationToInterval(2, true)).toBe('2 days')
  })

  it('clamps to a sane floor', () => {
    expect(durationToInterval(-5, false)).toBe('0 minutes')
    expect(durationToInterval(0, true)).toBe('1 days')
  })
})

describe('start <-> timestamptz', () => {
  it('round-trips a timed start through UTC', () => {
    const start = '2026-03-14T09:30'
    expect(tsToStart(startToTs(start, false), false)).toBe(start)
  })

  it('round-trips an all-day start', () => {
    const start = '2026-03-14'
    expect(tsToStart(startToTs(start, true), true)).toBe(start)
  })

  it('anchors an all-day start at local midnight', () => {
    expect(startToTs('2026-03-14', true)).toBe(new Date('2026-03-14T00:00:00').toISOString())
  })
})

describe('tsToDateKey', () => {
  it('keys by the local date of the stored instant', () => {
    const ts = new Date('2026-03-14T23:00:00').toISOString()
    expect(tsToDateKey(ts)).toBe('2026-03-14')
  })

  it('agrees with the lower bound of that date range', () => {
    // The two are used together: rows are matched by range, keyed by date.
    expect(tsToDateKey(dayRange('2026-03-14').from)).toBe('2026-03-14')
  })
})

describe('dayRange', () => {
  it('spans exactly one local day, half-open', () => {
    const { from, to } = dayRange('2026-03-14')
    expect(from).toBe(new Date('2026-03-14T00:00:00').toISOString())
    expect(to).toBe(new Date('2026-03-15T00:00:00').toISOString())
  })

  it('brackets any time of day on that date', () => {
    // This is what makes row matching survive a series time edit: a row written
    // at 08:00 is still found after the series moves to 18:00.
    const { from, to } = dayRange('2026-03-14')
    for (const time of ['00:00', '08:00', '18:00', '23:59']) {
      const ts = new Date(`2026-03-14T${time}:00`).toISOString()
      expect(ts >= from && ts < to).toBe(true)
    }
  })

  it('excludes the neighbouring days', () => {
    const { from, to } = dayRange('2026-03-14')
    const before = new Date('2026-03-13T23:59:00').toISOString()
    const after = new Date('2026-03-15T00:00:00').toISOString()
    expect(before < from).toBe(true)
    expect(after >= to).toBe(true)
  })
})

describe('occurrenceTs', () => {
  const at = (start: string | null, allDay: boolean, date: string) =>
    occurrenceTs({ allDay, start }, date)

  it('keeps the series time of day, on the day asked for', () => {
    // 09:30 on a different day than the series' own start.
    expect(at('2026-03-02T09:30', false, '2026-03-16')).toBe(
      new Date('2026-03-16T09:30').toISOString(),
    )
  })

  it('puts an all-day series at local midnight', () => {
    expect(at('2026-03-02', true, '2026-03-16')).toBe(new Date('2026-03-16T00:00:00').toISOString())
  })

  it('falls back to midnight when the start carries no time of day', () => {
    const midnight = new Date('2026-03-16T00:00').toISOString()
    // A date-only start on a timed series, and a series with no start at all.
    expect(at('2026-03-02', false, '2026-03-16')).toBe(midnight)
    expect(at(null, false, '2026-03-16')).toBe(midnight)
  })

  it('round-trips back to the date it was asked for', () => {
    for (const date of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(tsToDateKey(at('2026-01-05T23:30', false, date))).toBe(date)
    }
  })
})
