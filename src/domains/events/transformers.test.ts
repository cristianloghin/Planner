import { describe, expect, it } from 'vitest'
import { toISODate } from '../../assets/utils/dates'
import type { Series } from '../../client/series'
import { patchRemoveEvent, patchRemoveTemplate, patchSaveEvent, patchSaveTemplate } from './patches'
import {
  fromAttachments,
  fromEvent,
  fromTemplate,
  toAttachments,
  toEvent,
  toTemplate,
} from './transformers'
import type { Attachment, CalendarEvent } from './types'

const series = (over: Partial<Series> = {}): Series => ({
  id: 'S1',
  title: 'Swimming',
  allDay: false,
  start: '2026-04-07T16:00',
  duration: 60,
  recurrence: { freq: 'weekly', interval: 1 },
  attendees: ['p1'],
  colorKey: '3',
  checklist: [],
  notes: [],
  reminders: [],
  isTemplate: false,
  ...over,
})

describe('toAttachments', () => {
  it('gathers lines under their heading, in stored order', () => {
    const out = toAttachments('S1', {
      checklist: [
        { id: 'c2', label: 'Towel', groupLabel: 'Bag', sortOrder: 1 },
        { id: 'c1', label: 'Goggles', groupLabel: 'Bag', sortOrder: 0 },
      ],
      notes: [],
      reminders: [],
    })
    expect(out).toEqual([
      {
        id: 'S1:checklist:Bag',
        kind: 'checklist',
        title: 'Bag',
        items: [
          { id: 'c1', title: 'Goggles' },
          { id: 'c2', title: 'Towel' },
        ],
      },
    ])
  })

  it('keeps two checklists apart and in the order their lines were numbered', () => {
    const out = toAttachments('S1', {
      checklist: [
        { id: 'b1', label: 'Snack', groupLabel: 'After', sortOrder: 1000 },
        { id: 'a1', label: 'Goggles', groupLabel: 'Bag', sortOrder: 0 },
      ],
      notes: [],
      reminders: [],
    })
    expect(out.map((a) => a.kind === 'checklist' && a.title)).toEqual(['Bag', 'After'])
  })

  it('treats a checklist with no heading as untitled rather than named empty', () => {
    const [only] = toAttachments('S1', {
      checklist: [{ id: 'c1', label: 'Thing', groupLabel: null, sortOrder: 0 }],
      notes: [],
      reminders: [],
    })
    expect(only).toMatchObject({ kind: 'checklist', title: undefined, id: 'S1:checklist:' })
  })

  it('puts checklists first, then notes, then reminders', () => {
    const out = toAttachments('S1', {
      checklist: [{ id: 'c1', label: 'Goggles', groupLabel: 'Bag', sortOrder: 0 }],
      notes: [{ id: 'n1', body: 'Bring cash' }],
      reminders: [{ id: 'r1', offset: 30 }],
    })
    expect(out.map((a) => a.kind)).toEqual(['checklist', 'note', 'reminder'])
  })

  it('gives a checklist the same id every time, since it has no row of its own', () => {
    const lines = { checklist: [{ id: 'c1', label: 'x', groupLabel: 'Bag', sortOrder: 0 }] }
    const a = toAttachments('S1', { ...lines, notes: [], reminders: [] })
    const b = toAttachments('S1', { ...lines, notes: [], reminders: [] })
    expect(a[0].id).toBe(b[0].id)
  })
})

describe('attachments round trip', () => {
  const attachments: Attachment[] = [
    {
      id: 'S1:checklist:Bag',
      kind: 'checklist',
      title: 'Bag',
      items: [
        { id: 'c1', title: 'Goggles' },
        { id: 'c2', title: 'Towel' },
      ],
    },
    {
      id: 'S1:checklist:After',
      kind: 'checklist',
      title: 'After',
      items: [{ id: 'c3', title: 'Snack' }],
    },
    { id: 'n1', kind: 'note', text: 'Bring cash' },
    { id: 'r1', kind: 'reminder', offset: 30 },
  ]

  it('survives being taken apart and put back together', () => {
    expect(toAttachments('S1', fromAttachments(attachments))).toEqual(attachments)
  })

  it('numbers each checklist from its own block so the two stay apart', () => {
    expect(fromAttachments(attachments).checklist.map((l) => l.sortOrder)).toEqual([0, 1, 1000])
  })

  it('does not keep the order notes and checklists were written in', () => {
    // The database has nowhere to record it. Contents survive; interleaving does not.
    const interleaved: Attachment[] = [
      { id: 'n1', kind: 'note', text: 'first' },
      {
        id: 'S1:checklist:Bag',
        kind: 'checklist',
        title: 'Bag',
        items: [{ id: 'c1', title: 'x' }],
      },
    ]
    expect(toAttachments('S1', fromAttachments(interleaved)).map((a) => a.kind)).toEqual([
      'checklist',
      'note',
    ])
  })
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
      attachments: [],
    })
  })
})

describe('back to a series', () => {
  it('an event round-trips', () => {
    const original = series({ checklist: [], notes: [{ id: 'n1', body: 'hi' }] })
    expect(fromEvent(toEvent(original))).toEqual(original)
  })

  it('a blueprint is stored with no start and no repeat', () => {
    const stored = fromTemplate(toTemplate(series({ isTemplate: true })))
    expect(stored.isTemplate).toBe(true)
    expect(stored.start).toBeNull()
    expect(stored.recurrence).toBeUndefined()
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
    expect(patchRemoveEvent([a, b], 'gone')).toEqual([a, b])
  })

  it('does the same for blueprints', () => {
    const t = toTemplate(series({ id: 'T' }))
    expect(patchSaveTemplate([], t)).toEqual([t])
    expect(patchSaveTemplate([t], { ...t, title: 'Renamed' })[0].title).toBe('Renamed')
    expect(patchRemoveTemplate([t], 'T')).toEqual([])
  })

  it('does not modify the list it was given', () => {
    const list = [a, b]
    patchSaveEvent(list, { ...a, title: 'x' })
    patchRemoveEvent(list, 'A')
    expect(list.map((e) => `${e.id}:${e.title}`)).toEqual(['A:Swimming', 'B:Swimming'])
  })
})
