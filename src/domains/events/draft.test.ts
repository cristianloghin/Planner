import { describe, expect, it } from 'vitest'
import {
  applyTemplate,
  draftDuration,
  draftForEvent,
  draftForNew,
  draftValid,
  eventFromDraft,
  moveStart,
  templateDraftChanged,
  templateDraftDuration,
  templateDraftFor,
  templateDraftForNew,
  templateFromDraft,
  templateFromTemplateDraft,
} from './draft'
import type { CalendarEvent, EventTemplate } from './types'

const event: CalendarEvent = {
  id: 'S1',
  title: 'Swimming',
  start: '2026-04-07T16:00',
  allDay: false,
  duration: 60,
  recurrence: { freq: 'weekly', interval: 2, count: 8 },
  attendees: ['p1'],
  colorKey: '3',
  reminders: [{ id: 'r1', offset: 30 }],
}

describe('draftForNew', () => {
  it('opens at nine for an hour unless told otherwise', () => {
    const d = draftForNew({ date: '2026-04-07', attendees: ['p1'] })
    expect([d.startDT, d.endDT]).toEqual(['2026-04-07T09:00', '2026-04-07T10:00'])
    const at = draftForNew({ date: '2026-04-07', attendees: ['p1'], startMin: 23 * 60 + 30 })
    expect(at.endDT).toBe('2026-04-08T00:00')
  })
})

describe('eventFromDraft', () => {
  it('round-trips an event through the form', () => {
    const { id: _id, ...rest } = event
    expect(eventFromDraft(draftForEvent(event))).toEqual(rest)
  })

  it('writes exactly one recurrence end', () => {
    const d = { ...draftForEvent(event), ends: 'on' as const, endDate: '2026-06-01' }
    expect(eventFromDraft(d).recurrence).toEqual({
      freq: 'weekly',
      interval: 2,
      until: '2026-06-01',
    })
    expect(eventFromDraft({ ...d, ends: 'never' }).recurrence).toEqual({
      freq: 'weekly',
      interval: 2,
    })
  })

  it('an all-day draft is whole days from its date', () => {
    const d = { ...draftForNew({ date: '2026-04-07', attendees: ['p1'] }), allDay: true, days: 3 }
    expect(eventFromDraft(d)).toMatchObject({ start: '2026-04-07', allDay: true, duration: 3 })
  })
})

describe('draftDuration and validity', () => {
  it('never saves something shorter than the snap', () => {
    const d = {
      ...draftForNew({ date: '2026-04-07', attendees: ['p1'] }),
      endDT: '2026-04-07T09:05',
    }
    expect(draftDuration(d)).toBe(15)
  })

  it('refuses an empty title or a half-typed picker', () => {
    const d = draftForNew({ date: '2026-04-07', attendees: ['p1'] })
    expect(draftValid(d)).toBe(false)
    expect(draftValid({ ...d, title: 'x' })).toBe(true)
    expect(draftValid({ ...d, title: 'x', endDT: '' })).toBe(false)
  })
})

describe('moveStart', () => {
  it('carries the duration along with the start', () => {
    const d = { ...draftForNew({ date: '2026-04-07', attendees: ['p1'] }), title: 'x' }
    expect(moveStart(d, '2026-04-08T14:00').endDT).toBe('2026-04-08T15:00')
  })
})

describe('templates', () => {
  const t: EventTemplate = {
    id: 'T',
    title: 'Dentist',
    allDay: false,
    duration: 45,
    attendees: ['p2'],
    reminders: [{ id: 'r9', offset: 60 }],
  }

  it('applying keeps the chosen start and stretches the end', () => {
    const d = applyTemplate(draftForNew({ date: '2026-04-07', attendees: ['p1'] }), t)
    expect(d).toMatchObject({
      title: 'Dentist',
      attendees: ['p2'],
      startDT: '2026-04-07T09:00',
      endDT: '2026-04-07T09:45',
    })
    expect(d.reminders[0].id).not.toBe('r9')
  })

  it('saving as a template drops the time and re-ids the reminders', () => {
    const tpl = templateFromDraft(draftForEvent(event))
    expect(tpl).toMatchObject({ title: 'Swimming', duration: 60, attendees: ['p1'] })
    expect(tpl.reminders[0].id).not.toBe('r1')
  })
})

describe('template drafts', () => {
  const t: EventTemplate = {
    id: 'T',
    title: 'Dentist',
    allDay: false,
    duration: 90,
    attendees: ['p2'],
    reminders: [{ id: 'r9', offset: 60 }],
  }

  it('round-trips a template through the form', () => {
    const { id: _id, ...rest } = t
    expect(templateFromTemplateDraft(templateDraftFor(t))).toEqual(rest)
    expect(templateDraftFor(t)).toMatchObject({ hours: 1, minutes: 30 })
  })

  it('a draft has changed when it would save something different', () => {
    const initial = templateDraftForNew(['a'])
    expect(templateDraftChanged(initial, initial)).toBe(false)
    expect(templateDraftChanged({ ...initial, title: 'Dentist' }, initial)).toBe(true)
    expect(templateDraftChanged({ ...initial, minutes: 30 }, initial)).toBe(true)
    // Hours are not part of an all-day template, so editing them changes nothing.
    const allDay = { ...initial, allDay: true }
    expect(templateDraftChanged({ ...allDay, hours: 5 }, allDay)).toBe(false)
  })

  it('an all-day template is whole days', () => {
    const d = templateDraftFor({ ...t, allDay: true, duration: 3 })
    expect(templateDraftDuration(d)).toBe(3)
    expect(templateFromTemplateDraft(d)).toMatchObject({ allDay: true, duration: 3 })
  })

  it('a new template is an hour for the given people, and never shorter than the snap', () => {
    const d = templateDraftForNew(['p1'])
    expect(templateDraftDuration(d)).toBe(60)
    expect(templateDraftDuration({ ...d, hours: 0, minutes: 5 })).toBe(15)
  })
})
