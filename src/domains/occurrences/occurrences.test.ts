import { describe, expect, it } from 'vitest'
import type { DependencyRow, ItemStateRow, OccurrenceRow } from '../../client/occurrences'
import { patchAddDependency, patchCompletions, patchEntry, patchRemoveDependency } from './patches'
import { dependenciesByOccurrence, occurrenceKey, toCompletions } from './transformers'
import type { OccurrenceDependency } from './types'

const row = (over: Partial<OccurrenceRow> = {}): OccurrenceRow => ({
  seriesId: 'S',
  date: '2026-04-07',
  status: null,
  cancelled: false,
  start: null,
  duration: null,
  ...over,
})

const tick = (over: Partial<ItemStateRow> = {}): ItemStateRow => ({
  seriesId: 'S',
  date: '2026-04-07',
  itemId: 'c1',
  done: true,
  ...over,
})

describe('toCompletions', () => {
  it('keys each day under its event and date', () => {
    expect(toCompletions([row({ status: 'done' })], [])).toEqual({
      'S:2026-04-07': { status: 'done' },
    })
  })

  it('leaves out a row carrying nothing the app shows', () => {
    // Clearing a status can leave an empty row behind. An entry for it would
    // read as "something happened here" on a day where nothing did.
    expect(toCompletions([row()], [])).toEqual({})
  })

  it('carries a day that was moved, and one taken out', () => {
    expect(
      toCompletions(
        [
          row({ start: '2026-04-07T18:00', duration: 90 }),
          row({ date: '2026-04-08', cancelled: true }),
        ],
        [],
      ),
    ).toEqual({
      'S:2026-04-07': { start: '2026-04-07T18:00', duration: 90 },
      'S:2026-04-08': { cancelled: true },
    })
  })

  it('folds ticks onto the same day as its other state', () => {
    expect(toCompletions([row({ status: 'done' })], [tick()])).toEqual({
      'S:2026-04-07': { status: 'done', checked: { c1: true } },
    })
  })

  it('records a ticked day that has nothing else on it', () => {
    expect(toCompletions([], [tick(), tick({ itemId: 'c2', done: false })])).toEqual({
      'S:2026-04-07': { checked: { c1: true, c2: false } },
    })
  })

  it('layers two rows that land on the same day', () => {
    // A day's row is stored at the time of day the series had when it was
    // written, so an edit to the series time can leave one row at the old time
    // and one at the new — both on the same day, which is all this is keyed by.
    // Taking the last one alone would drop whatever the first recorded.
    expect(
      toCompletions(
        [row({ status: 'done' }), row({ start: '2026-04-07T18:00', duration: 90 })],
        [],
      ),
    ).toEqual({
      'S:2026-04-07': { status: 'done', start: '2026-04-07T18:00', duration: 90 },
    })
  })

  it('lets a later row on the same day win a field they both set', () => {
    expect(toCompletions([row({ status: 'done' }), row({ status: 'skipped' })], [])).toEqual({
      'S:2026-04-07': { status: 'skipped' },
    })
  })

  it('keeps a day whose second row carries nothing', () => {
    // The empty one must not erase what the first row recorded.
    expect(toCompletions([row({ status: 'done' }), row()], [])).toEqual({
      'S:2026-04-07': { status: 'done' },
    })
  })

  it('keeps different events and days apart', () => {
    const out = toCompletions(
      [row({ status: 'done' }), row({ seriesId: 'T', status: 'skipped' })],
      [],
    )
    expect(Object.keys(out).sort()).toEqual(['S:2026-04-07', 'T:2026-04-07'])
  })
})

describe('dependenciesByOccurrence', () => {
  const dep = (over: Partial<DependencyRow> = {}): DependencyRow => ({
    dependentSeriesId: 'A',
    dependentDate: '2026-04-07',
    prerequisiteSeriesId: 'B',
    prerequisiteDate: '2026-04-06',
    requiredStatus: 'done',
    ...over,
  })

  it('keeps waits under the day doing the waiting', () => {
    expect(dependenciesByOccurrence([dep()])).toEqual({
      'A:2026-04-07': [
        { prerequisiteSeriesId: 'B', prerequisiteDate: '2026-04-06', requiredStatus: 'done' },
      ],
    })
  })

  it('collects several waits on one day', () => {
    const out = dependenciesByOccurrence([dep(), dep({ prerequisiteSeriesId: 'C' })])
    expect(out['A:2026-04-07']).toHaveLength(2)
  })
})

describe('patchEntry', () => {
  it('sets a status and clears it, keeping everything else on the day', () => {
    expect(patchEntry({ cancelled: true }, { kind: 'status', status: 'done' })).toEqual({
      cancelled: true,
      status: 'done',
    })
    expect(
      patchEntry({ status: 'done', start: '2026-04-07T18:00' }, { kind: 'status', status: null }),
    ).toEqual({ start: '2026-04-07T18:00' })
  })

  it('ticks a line without disturbing the others', () => {
    expect(
      patchEntry({ checked: { c1: true } }, { kind: 'tick', entryId: 'c2', checked: true }),
    ).toEqual({ checked: { c1: true, c2: true } })
  })

  it('moves a day and puts it back, keeping its status', () => {
    const moved = patchEntry(
      { status: 'done' },
      {
        kind: 'override',
        start: '2026-04-07T18:00',
        duration: 90,
      },
    )
    expect(moved).toEqual({ status: 'done', start: '2026-04-07T18:00', duration: 90 })
    expect(patchEntry(moved, { kind: 'clearOverride' })).toEqual({ status: 'done' })
  })

  it('takes a day out, leaving what was recorded on it', () => {
    expect(patchEntry({ status: 'done' }, { kind: 'cancel' })).toEqual({
      status: 'done',
      cancelled: true,
    })
  })
})

describe('patchCompletions', () => {
  const key = occurrenceKey('S', '2026-04-07')

  it('drops a day patched back to nothing, matching the read', () => {
    expect(
      patchCompletions({ [key]: { status: 'done' } }, key, {
        kind: 'status',
        status: null,
      }),
    ).toEqual({})
  })

  it('records against a day nothing was on', () => {
    expect(patchCompletions({}, key, { kind: 'cancel' })).toEqual({ [key]: { cancelled: true } })
  })

  it('leaves other days alone and does not modify what it was given', () => {
    const before = { 'S:2026-04-01': { status: 'done' as const } }
    const after = patchCompletions(before, key, { kind: 'cancel' })
    expect(after['S:2026-04-01']).toBe(before['S:2026-04-01'])
    expect(Object.keys(before)).toEqual(['S:2026-04-01'])
  })
})

describe('waiting patches', () => {
  const key = 'A:2026-04-07'
  const edge: OccurrenceDependency = {
    prerequisiteSeriesId: 'B',
    prerequisiteDate: '2026-04-06',
    requiredStatus: 'done',
  }

  it('adds a wait to a day that had none', () => {
    expect(patchAddDependency({}, key, edge)).toEqual({ [key]: [edge] })
  })

  it('changing how far along the other day must be replaces it rather than adding a second', () => {
    const stricter = { ...edge, requiredStatus: 'skipped' as const }
    expect(patchAddDependency({ [key]: [edge] }, key, stricter)).toEqual({ [key]: [stricter] })
  })

  it('removes a wait, and drops the day once it waits on nothing', () => {
    expect(patchRemoveDependency({ [key]: [edge] }, key, 'B', '2026-04-06')).toEqual({})
  })

  it('removing a wait that was never there changes nothing', () => {
    expect(patchRemoveDependency({}, key, 'B', '2026-04-06')).toEqual({})
    expect(patchRemoveDependency({ [key]: [edge] }, key, 'B', '2020-01-01')).toEqual({
      [key]: [edge],
    })
  })
})
