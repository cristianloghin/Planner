import { describe, expect, it } from 'vitest'
import {
  ALLDAY_REMINDER_MIN,
  type SenderReminder,
  type SenderSeries,
  computeDueReminders,
  parseRRule,
  startsOn as senderStartsOn,
  wallParts,
  wallToInstantMs,
} from '../../supabase/functions/send-reminders/logic.ts'
import type { CalendarEvent, Recurrence } from '../types'
import { startsOn as clientStartsOn } from './recurrence'
import { recurrenceToRRule } from './rrule'

/** The sender must expand recurrences EXACTLY like the client, or a partner
 *  gets pushed about occurrences the calendar doesn't show. Cross-validate
 *  the two implementations over a spread of rules and dates. */
describe('sender startsOn ≡ client startsOn', () => {
  const anchor = '2026-06-15'
  const rules: (Recurrence | undefined)[] = [
    undefined,
    { freq: 'daily', interval: 1 },
    { freq: 'daily', interval: 3 },
    { freq: 'weekly', interval: 1 },
    { freq: 'weekly', interval: 2 },
    { freq: 'monthly', interval: 1 },
    { freq: 'monthly', interval: 2 },
    { freq: 'daily', interval: 1, until: '2026-06-20' },
    { freq: 'weekly', interval: 1, until: '2026-07-06' },
  ]

  function clientEvent(recurrence?: Recurrence): CalendarEvent {
    return {
      id: 'e',
      title: 'T',
      start: anchor,
      allDay: true,
      duration: 1,
      attendees: [],
      attachments: [],
      recurrence,
    }
  }

  it('agrees across 120 consecutive days for every rule shape', () => {
    for (const rule of rules) {
      const ev = clientEvent(rule)
      for (let i = -5; i < 115; i++) {
        const date = new Date(Date.parse('2026-06-10T00:00:00Z') + i * 86_400_000)
          .toISOString()
          .slice(0, 10)
        expect(senderStartsOn(anchor, rule, date), `${JSON.stringify(rule)} @ ${date}`).toBe(
          clientStartsOn(ev, date),
        )
      }
    }
  })

  it('agrees on monthly overflow months (Jan 31 → Feb skipped)', () => {
    const rule: Recurrence = { freq: 'monthly', interval: 1 }
    const ev = { ...clientEvent(rule), start: '2026-01-31' }
    for (const date of ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']) {
      expect(senderStartsOn('2026-01-31', rule, date)).toBe(clientStartsOn(ev, date))
    }
  })
})

describe('parseRRule ≡ client encoding', () => {
  it('round-trips what recurrenceToRRule writes, including UNTIL', () => {
    const cases: Recurrence[] = [
      { freq: 'daily', interval: 1 },
      { freq: 'weekly', interval: 2 },
      { freq: 'monthly', interval: 3 },
      { freq: 'weekly', interval: 1, until: '2026-06-17' },
      { freq: 'monthly', interval: 2, until: '2026-12-31' },
    ]
    for (const r of cases) {
      expect(parseRRule(recurrenceToRRule(r))).toEqual(r)
    }
  })

  it('treats null/unmodelled rules as one-offs', () => {
    expect(parseRRule(null)).toBeUndefined()
    expect(parseRRule('FREQ=YEARLY')).toBeUndefined()
  })

  it('decodes a legacy locally-encoded UNTIL to its intended date', () => {
    // Written by a UTC+2 client as local end-of-day 2026-06-17.
    expect(parseRRule('FREQ=DAILY;UNTIL=20260617T215959Z')?.until).toBe('2026-06-17')
    // Written by a UTC-5 client.
    expect(parseRRule('FREQ=DAILY;UNTIL=20260618T045959Z')?.until).toBe('2026-06-17')
  })
})

describe('timezone bridging', () => {
  it('round-trips wall time ↔ instant in a non-UTC zone', () => {
    const ms = wallToInstantMs('Europe/Bucharest', '2026-07-09', 9 * 60)
    expect(wallParts('Europe/Bucharest', ms)).toEqual({ date: '2026-07-09', minutes: 9 * 60 })
    // Bucharest is UTC+3 in July: 09:00 wall = 06:00Z.
    expect(new Date(ms).toISOString()).toBe('2026-07-09T06:00:00.000Z')
  })

  it('handles a DST transition day', () => {
    // Europe/Bucharest springs forward on 2026-03-29 (03:00 → 04:00).
    const before = wallToInstantMs('Europe/Bucharest', '2026-03-29', 2 * 60) // 02:00 EET (+2)
    const after = wallToInstantMs('Europe/Bucharest', '2026-03-29', 5 * 60) // 05:00 EEST (+3)
    expect(new Date(before).toISOString()).toBe('2026-03-29T00:00:00.000Z')
    expect(new Date(after).toISOString()).toBe('2026-03-29T02:00:00.000Z')
  })
})

describe('computeDueReminders', () => {
  const TZ = 'Europe/Bucharest' // UTC+3 in July
  // Weekly Thursday 09:00 wall time, anchored 2026-07-09 (a Thursday).
  const series: SenderSeries = {
    id: 's1',
    title: 'School run',
    all_day: false,
    dtstart: '2026-07-09T06:00:00Z', // 09:00 +03
    rrule: 'FREQ=WEEKLY;INTERVAL=1',
  }
  const reminder: SenderReminder = {
    id: 'r1',
    series_id: 's1',
    user_id: 'u1',
    offset_seconds: 15 * 60,
  }
  const fireMs = Date.parse('2026-07-09T05:45:00Z') // 08:45 wall

  function windowAround(ms: number) {
    return { windowStartMs: ms - 5 * 60_000, windowEndMs: ms + 60_000 }
  }

  it('fires a timed reminder inside the window, with wall-clock body text', () => {
    const due = computeDueReminders({
      series: [series],
      reminders: [reminder],
      overrides: [],
      timeZone: TZ,
      ...windowAround(fireMs),
    })
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({
      seriesId: 's1',
      reminderId: 'r1',
      userId: 'u1',
      fireAtMs: fireMs,
      body: 'Starts at 09:00',
    })
    expect(new Date(due[0].occurrenceStart).toISOString()).toBe('2026-07-09T06:00:00.000Z')
  })

  it('fires nothing outside the window', () => {
    const due = computeDueReminders({
      series: [series],
      reminders: [reminder],
      overrides: [],
      timeZone: TZ,
      ...windowAround(fireMs - 30 * 60_000),
    })
    expect(due).toHaveLength(0)
  })

  it('skips a cancelled occurrence but keeps the next week', () => {
    const overrides = [
      {
        series_id: 's1',
        occurrence_start: '2026-07-09T06:00:00Z',
        rescheduled_to: null,
        cancelled: true,
      },
    ]
    expect(
      computeDueReminders({
        series: [series],
        reminders: [reminder],
        overrides,
        timeZone: TZ,
        ...windowAround(fireMs),
      }),
    ).toHaveLength(0)
    const nextWeek = computeDueReminders({
      series: [series],
      reminders: [reminder],
      overrides,
      timeZone: TZ,
      ...windowAround(fireMs + 7 * 86_400_000),
    })
    expect(nextWeek).toHaveLength(1)
  })

  it('fires relative to a reschedule, keeping the ORIGINAL slot as identity', () => {
    // Moved from 09:00 to 16:00 the same day.
    const overrides = [
      {
        series_id: 's1',
        occurrence_start: '2026-07-09T06:00:00Z',
        rescheduled_to: '2026-07-09T13:00:00Z',
        cancelled: false,
      },
    ]
    const movedFire = Date.parse('2026-07-09T12:45:00Z')
    expect(
      computeDueReminders({
        series: [series],
        reminders: [reminder],
        overrides,
        timeZone: TZ,
        ...windowAround(fireMs),
      }),
    ).toHaveLength(0) // nothing at the old time
    const due = computeDueReminders({
      series: [series],
      reminders: [reminder],
      overrides,
      timeZone: TZ,
      ...windowAround(movedFire),
    })
    expect(due).toHaveLength(1)
    expect(due[0].body).toBe('Starts at 16:00')
    expect(new Date(due[0].occurrenceStart).toISOString()).toBe('2026-07-09T06:00:00.000Z')
  })

  it('matches an override row by wall DATE even after a series time edit', () => {
    // The override row was written when the series started at 10:00 (07:00Z);
    // the series has since moved to 09:00. Day-range identity must still find
    // the cancellation.
    const overrides = [
      {
        series_id: 's1',
        occurrence_start: '2026-07-09T07:00:00Z',
        rescheduled_to: null,
        cancelled: true,
      },
    ]
    expect(
      computeDueReminders({
        series: [series],
        reminders: [reminder],
        overrides,
        timeZone: TZ,
        ...windowAround(fireMs),
      }),
    ).toHaveLength(0)
  })

  it('anchors all-day reminders to the fixed morning minute', () => {
    const allDay: SenderSeries = { ...series, id: 's2', all_day: true, rrule: null }
    const r: SenderReminder = { ...reminder, id: 'r2', series_id: 's2', offset_seconds: 0 }
    const expectedFire = wallToInstantMs(TZ, '2026-07-09', ALLDAY_REMINDER_MIN)
    const due = computeDueReminders({
      series: [allDay],
      reminders: [r],
      overrides: [],
      timeZone: TZ,
      ...windowAround(expectedFire),
    })
    expect(due).toHaveLength(1)
    expect(due[0].fireAtMs).toBe(expectedFire)
    expect(due[0].body).toBe('All-day plan today')
  })

  it('respects an UNTIL cap', () => {
    const capped: SenderSeries = { ...series, rrule: 'FREQ=WEEKLY;UNTIL=20260709T235959Z' }
    expect(
      computeDueReminders({
        series: [capped],
        reminders: [reminder],
        overrides: [],
        timeZone: TZ,
        ...windowAround(fireMs),
      }),
    ).toHaveLength(1) // the cap day itself is inclusive
    expect(
      computeDueReminders({
        series: [capped],
        reminders: [reminder],
        overrides: [],
        timeZone: TZ,
        ...windowAround(fireMs + 7 * 86_400_000),
      }),
    ).toHaveLength(0)
  })
})
