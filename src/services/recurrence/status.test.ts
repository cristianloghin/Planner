import { describe, expect, it } from 'vitest'
import type { Attachment, CalendarEvent } from '../../domains/events/types'
import type { OccurrenceState } from '../../domains/occurrences/types'
import { isOccurrenceDone, occKey } from './status'

function ev(id: string, attachments: Attachment[] = []): CalendarEvent {
  return {
    id,
    title: id,
    start: '2026-06-15',
    allDay: true,
    duration: 1,
    attendees: [],
    attachments,
  }
}

const checklist = (id: string, ...entryIds: string[]): Attachment => ({
  id,
  kind: 'checklist',
  items: entryIds.map((e) => ({ id: e, title: e })),
})

describe('isOccurrenceDone', () => {
  const date = '2026-06-15'

  it('is never done without a checklist — there is no explicit status any more', () => {
    const e = ev('e1')
    expect(isOccurrenceDone({}, e, date)).toBe(false)
    // Even with a state entry for the day: a moved or cancelled day is not "done".
    const moved: OccurrenceState = { start: '2026-06-15', duration: 1 }
    expect(isOccurrenceDone({ [occKey('e1', date)]: moved }, e, date)).toBe(false)
  })

  it('is done only when every checklist entry is checked', () => {
    const e = ev('e1', [checklist('c1', 'x', 'y')])
    const partial: OccurrenceState = { checked: { x: true } }
    expect(isOccurrenceDone({ [occKey('e1', date)]: partial }, e, date)).toBe(false)
    const all: OccurrenceState = { checked: { x: true, y: true } }
    expect(isOccurrenceDone({ [occKey('e1', date)]: all }, e, date)).toBe(true)
  })

  it('an empty checklist is never done', () => {
    const e = ev('e1', [checklist('c1')])
    expect(isOccurrenceDone({}, e, date)).toBe(false)
    expect(isOccurrenceDone({ [occKey('e1', date)]: { checked: {} } }, e, date)).toBe(false)
  })
})
