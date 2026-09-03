import { describe, expect, it } from 'vitest'
import { toISODate } from '../../assets/utils/dates'
import type { Series } from '../../client/series'
import { patchRemoveEvent, patchRemoveTemplate, patchSaveEvent, patchSaveTemplate } from './patches'
import { cloneReminders, fromEvent, fromTemplate, toEvent, toTemplate } from './transformers'
import type { CalendarEvent } from './types'

const series = (over: Partial<Series> = {}): Series => ({
  id: 'S1',
  title: 'Swimming',
  allDay: false,
  start: '2026-04-07T16:00',
  duration: 60,
  recurrence: { freq: 'weekly', interval: 1 },
  attendees: ['p1'],
  colorKey: '3',
  reminders: [],
  isTemplate: false,
  ...over,
})

describe('toEvent', () => {
  it('carries the series across as it stands', () => {
    expect(toEvent(series())).toMatchObject({
      id: 'S1',
      title: 'Swimming',
      start: '2026-04-07T16:00',
      duration: 60,
      colorKey: '3',
      recurrence: { freq: 'weekly', interval: 1 },
    })
  })

  it('carries reminders straight through, with no conversion', () => {
    const reminders = [{ id: 'r1', offset: 30 }]
    expect(toEvent(series({ reminders })).reminders).toEqual(reminders)
  })

  it('starts a series with no date today, so it can be drawn at all', () => {
    expect(toEvent(series({ start: null })).start).toBe(toISODate(new Date()))
  })
})

describe('toTemplate', () => {
  it('keeps everything but the timing', () => {
    const t = toTemplate(series({ isTemplate: true, start: null, recurrence: undefined }))
    expect(t).toEqual({
      id: 'S1',
      title: 'Swimming',
      allDay: false,
      duration: 60,
      attendees: ['p1'],
      reminders: [],
    })
  })
})

describe('back to a series', () => {
  it('an event round-trips', () => {
    const original = series({ reminders: [{ id: 'r1', offset: 30 }] })
    expect(fromEvent(toEvent(original))).toEqual(original)
  })

  it('a blueprint is stored with no start and no repeat', () => {
    const stored = fromTemplate(toTemplate(series({ isTemplate: true })))
    expect(stored.isTemplate).toBe(true)
    expect(stored.start).toBeNull()
    expect(stored.recurrence).toBeUndefined()
  })
})

describe('cloneReminders', () => {
  it('keeps the offsets but gives every reminder a fresh id', () => {
    const source = [
      { id: 'r1', offset: 30 },
      { id: 'r2', offset: 60 },
    ]
    const copy = cloneReminders(source)
    expect(copy.map((r) => r.offset)).toEqual([30, 60])
    expect(copy.map((r) => r.id)).not.toEqual(['r1', 'r2'])
    expect(new Set(copy.map((r) => r.id)).size).toBe(2)
    // The source is untouched — the copy owns brand-new rows.
    expect(source.map((r) => r.id)).toEqual(['r1', 'r2'])
  })
})

describe('patches', () => {
  const a: CalendarEvent = toEvent(series({ id: 'A' }))
  const b: CalendarEvent = toEvent(series({ id: 'B' }))

  it('adds an event that is not there yet', () => {
    expect(patchSaveEvent([a], b).map((e) => e.id)).toEqual(['A', 'B'])
  })

  it('replaces one that is, in place', () => {
    const edited = { ...a, title: 'Diving' }
    const next = patchSaveEvent([a, b], edited)
    expect(next.map((e) => e.title)).toEqual(['Diving', 'Swimming'])
    expect(next[1]).toBe(b)
  })

  it('removes one, and leaves the list alone for an unknown id', () => {
    expect(patchRemoveEvent([a, b], 'A').map((e) => e.id)).toEqual(['B'])
    expect(patchRemoveEvent([a, b], 'nope').map((e) => e.id)).toEqual(['A', 'B'])
  })

  it('does the same for blueprints', () => {
    const t = toTemplate(series({ id: 'T', isTemplate: true }))
    expect(patchSaveTemplate([], t).map((x) => x.id)).toEqual(['T'])
    expect(patchRemoveTemplate([t], 'T')).toEqual([])
  })
})
