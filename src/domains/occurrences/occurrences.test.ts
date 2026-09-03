import { describe, expect, it } from 'vitest'
import type { OccurrenceRow } from '../../client/occurrences'
import { patchCompletions, patchEntry } from './patches'
import { occurrenceKey, toCompletions } from './transformers'

const row = (over: Partial<OccurrenceRow> = {}): OccurrenceRow => ({
  seriesId: 'S',
  date: '2026-04-07',
  cancelled: false,
  start: null,
  duration: null,
  ...over,
})

describe('toCompletions', () => {
  it('keys each day under its event and date', () => {
    expect(toCompletions([row({ cancelled: true })])).toEqual({
      'S:2026-04-07': { cancelled: true },
    })
  })

  it('leaves out a row carrying nothing the app shows', () => {
    // Clearing a timing override leaves an empty row behind. An entry for it
    // would read as "something happened here" on a day where nothing did.
    expect(toCompletions([row()])).toEqual({})
  })

  it('carries a day that was moved, and one taken out', () => {
    expect(
      toCompletions([
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
      toCompletions([row({ cancelled: true }), row({ start: '2026-04-07T18:00', duration: 90 })]),
    ).toEqual({
      'S:2026-04-07': { cancelled: true, start: '2026-04-07T18:00', duration: 90 },
    })
  })

  it('lets a later row on the same day win a field they both set', () => {
    expect(
      toCompletions([row({ start: '2026-04-07T18:00' }), row({ start: '2026-04-07T20:00' })]),
    ).toEqual({ 'S:2026-04-07': { start: '2026-04-07T20:00' } })
  })

  it('keeps a day whose second row carries nothing', () => {
    // The empty one must not erase what the first row recorded.
    expect(toCompletions([row({ cancelled: true }), row()])).toEqual({
      'S:2026-04-07': { cancelled: true },
    })
  })

  it('keeps different events and days apart', () => {
    const out = toCompletions([row({ cancelled: true }), row({ seriesId: 'T', cancelled: true })])
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

describe('patchCompletions', () => {
  const key = occurrenceKey('S', '2026-04-07')

  it('drops a day patched back to nothing, matching the read', () => {
    expect(
      patchCompletions({ [key]: { start: '2026-04-07T18:00', duration: 90 } }, key, {
        kind: 'clearOverride',
      }),
    ).toEqual({})
  })

  it('records against a day nothing was on', () => {
    expect(patchCompletions({}, key, { kind: 'cancel' })).toEqual({ [key]: { cancelled: true } })
  })

  it('leaves other days alone and does not modify what it was given', () => {
    const before = { 'S:2026-04-01': { cancelled: true } }
    const after = patchCompletions(before, key, { kind: 'cancel' })
    expect(after['S:2026-04-01']).toBe(before['S:2026-04-01'])
    expect(Object.keys(before)).toEqual(['S:2026-04-01'])
  })
})
