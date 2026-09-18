import { describe, expect, it } from 'vitest'
import type { OccurrenceRow } from '../../client/occurrences'
import { patchEntry, patchMoveOccurrences, patchOccurrences, rosterChange } from './patches'
import { indexOccurrences, occurrenceKey, toOccurrences } from './transformers'

const row = (over: Partial<OccurrenceRow> = {}): OccurrenceRow => ({
  seriesId: 'S',
  date: '2026-04-07',
  cancelled: false,
  start: null,
  duration: null,
  attendees: null,
  ...over,
})

describe('toOccurrences', () => {
  it('keys each day under its event and date', () => {
    expect(toOccurrences([row({ cancelled: true })])).toEqual({
      'S:2026-04-07': { cancelled: true },
    })
  })

  it('leaves out a row carrying nothing the app shows', () => {
    // Clearing a timing override leaves an empty row behind. An entry for it
    // would read as "something happened here" on a day where nothing did.
    expect(toOccurrences([row()])).toEqual({})
  })

  it('carries a day that was moved, and one taken out', () => {
    expect(
      toOccurrences([
        row({ start: '2026-04-07T18:00', duration: 90 }),
        row({ date: '2026-04-08', cancelled: true }),
      ]),
    ).toEqual({
      'S:2026-04-07': { start: '2026-04-07T18:00', duration: 90 },
      'S:2026-04-08': { cancelled: true },
    })
  })

  it('layers two rows that land on the same day', () => {
    // A day's row is stored at the time of day the series had when it was
    // written, so an edit to the series time can leave one row at the old time
    // and one at the new — both on the same day, which is all this is keyed by.
    // Taking the last one alone would drop whatever the first recorded.
    expect(
      toOccurrences([row({ cancelled: true }), row({ start: '2026-04-07T18:00', duration: 90 })]),
    ).toEqual({
      'S:2026-04-07': { cancelled: true, start: '2026-04-07T18:00', duration: 90 },
    })
  })

  it('lets a later row on the same day win a field they both set', () => {
    expect(
      toOccurrences([row({ start: '2026-04-07T18:00' }), row({ start: '2026-04-07T20:00' })]),
    ).toEqual({ 'S:2026-04-07': { start: '2026-04-07T20:00' } })
  })

  it('keeps a day whose second row carries nothing', () => {
    // The empty one must not erase what the first row recorded.
    expect(toOccurrences([row({ cancelled: true }), row()])).toEqual({
      'S:2026-04-07': { cancelled: true },
    })
  })

  it('carries a day that overrides who is on it, and leaves the rest alone', () => {
    expect(toOccurrences([row({ attendees: ['p1'] }), row({ date: '2026-04-08' })])).toEqual({
      'S:2026-04-07': { attendees: ['p1'] },
    })
  })

  it('keeps different events and days apart', () => {
    const out = toOccurrences([row({ cancelled: true }), row({ seriesId: 'T', cancelled: true })])
    expect(Object.keys(out).sort()).toEqual(['S:2026-04-07', 'T:2026-04-07'])
  })
})

describe('patchEntry', () => {
  it('moves a day and puts it back, keeping what else is on it', () => {
    const moved = patchEntry(
      { cancelled: true },
      { kind: 'override', start: '2026-04-07T18:00', duration: 90 },
    )
    expect(moved).toEqual({ cancelled: true, start: '2026-04-07T18:00', duration: 90 })
    expect(patchEntry(moved, { kind: 'clearOverride' })).toEqual({ cancelled: true })
  })

  it('takes a day out, leaving what was recorded on it', () => {
    expect(patchEntry({ start: '2026-04-07T18:00' }, { kind: 'cancel' })).toEqual({
      start: '2026-04-07T18:00',
      cancelled: true,
    })
  })
})

describe('patchEntry — people', () => {
  it("sets this day's people and puts them back, keeping the timing", () => {
    const moved = { start: '2026-04-07T18:00', duration: 90 }
    const withPeople = patchEntry(moved, { kind: 'attendees', attendees: ['p1'] })
    expect(withPeople).toEqual({ ...moved, attendees: ['p1'] })
    expect(patchEntry(withPeople, { kind: 'clearAttendees' })).toEqual(moved)
  })

  it('a day that only overrides its people carries nothing else', () => {
    expect(patchEntry(undefined, { kind: 'attendees', attendees: ['p1', 'p2'] })).toEqual({
      attendees: ['p1', 'p2'],
    })
  })
})

describe('patchOccurrences', () => {
  const key = occurrenceKey('S', '2026-04-07')

  it('drops a day patched back to nothing, matching the read', () => {
    expect(
      patchOccurrences({ [key]: { start: '2026-04-07T18:00', duration: 90 } }, key, {
        kind: 'clearOverride',
      }),
    ).toEqual({})
  })

  it('drops a day whose only override was its people, once cleared', () => {
    expect(
      patchOccurrences({ [key]: { attendees: ['p1'] } }, key, { kind: 'clearAttendees' }),
    ).toEqual({})
  })

  it('records against a day nothing was on', () => {
    expect(patchOccurrences({}, key, { kind: 'cancel' })).toEqual({ [key]: { cancelled: true } })
  })

  it('leaves other days alone and does not modify what it was given', () => {
    const before = { 'S:2026-04-01': { cancelled: true } }
    const after = patchOccurrences(before, key, { kind: 'cancel' })
    expect(after['S:2026-04-01']).toBe(before['S:2026-04-01'])
    expect(Object.keys(before)).toEqual(['S:2026-04-01'])
  })
})

describe('rosterChange', () => {
  it("back to the series' own people is a clear, not a matching override", () => {
    expect(rosterChange(['b', 'a'], ['a', 'b'])).toEqual({ kind: 'clearAttendees' })
    expect(rosterChange(['a'], ['a', 'b'])).toEqual({ kind: 'attendees', attendees: ['a'] })
  })
})

describe('indexOccurrences', () => {
  it("looks a day up by event and date, and lists an event's recorded days", () => {
    const idx = indexOccurrences(
      toOccurrences([
        row({ cancelled: true }),
        row({ date: '2026-04-14', start: '2026-04-14T10:00' }),
      ]),
    )
    expect(idx.on('S', '2026-04-07')).toEqual({ cancelled: true })
    expect(idx.on('S', '2026-04-08')).toBeUndefined()
    expect(idx.of('S').map(([date]) => date)).toEqual(['2026-04-07', '2026-04-14'])
    expect(idx.of('nobody')).toEqual([])
  })
})

describe('patchMoveOccurrences', () => {
  it('files the days from the cut on under the new half, and leaves the rest', () => {
    const map = {
      [occurrenceKey('S', '2026-04-06')]: { cancelled: true },
      [occurrenceKey('S', '2026-04-07')]: { attendees: ['p1'] },
      [occurrenceKey('S', '2026-04-14')]: { start: '2026-04-14T18:00' },
      [occurrenceKey('T', '2026-04-14')]: { cancelled: true },
    }
    expect(patchMoveOccurrences(map, 'S', '2026-04-07', 'S2')).toEqual({
      [occurrenceKey('S', '2026-04-06')]: { cancelled: true },
      [occurrenceKey('S2', '2026-04-07')]: { attendees: ['p1'] },
      [occurrenceKey('S2', '2026-04-14')]: { start: '2026-04-14T18:00' },
      [occurrenceKey('T', '2026-04-14')]: { cancelled: true },
    })
  })

  it('does not mistake an event whose id merely starts the same way', () => {
    const map = { [occurrenceKey('S1', '2026-04-07')]: { cancelled: true } }
    expect(patchMoveOccurrences(map, 'S', '2026-04-07', 'S2')).toEqual(map)
  })
})
