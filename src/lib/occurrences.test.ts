import { describe, it, expect } from 'vitest'
import type { AppState, Attachment, CalendarEvent, OccurrenceState, OccurrenceDependency } from '../types'
import {
  occKey,
  isOccurrenceDone,
  occurrenceEffectiveStatus,
  blockingPrerequisites,
  occurrenceStatus,
} from './occurrences'

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

function state(over: Partial<AppState> = {}): AppState {
  return {
    people: {},
    lists: [],
    events: [],
    completions: {},
    dependencies: {},
    listLinks: {},
    preferences: { personColors: {} },
    weekStart: '2026-06-15',
    selectedDay: 0,
    ...over,
  }
}

describe('isOccurrenceDone', () => {
  const date = '2026-06-15'

  it('uses the explicit status when there is no checklist', () => {
    const e = ev('e1')
    expect(isOccurrenceDone(state(), e, date)).toBe(false)
    const done = state({ completions: { [occKey('e1', date)]: { status: 'done' } } })
    expect(isOccurrenceDone(done, e, date)).toBe(true)
  })

  it('is done only when every checklist entry is checked', () => {
    const e = ev('e1', [checklist('c1', 'x', 'y')])
    const partial: OccurrenceState = { checked: { x: true } }
    expect(isOccurrenceDone(state({ completions: { [occKey('e1', date)]: partial } }), e, date)).toBe(false)
    const all: OccurrenceState = { checked: { x: true, y: true } }
    expect(isOccurrenceDone(state({ completions: { [occKey('e1', date)]: all } }), e, date)).toBe(true)
  })

  it('an empty checklist is never done', () => {
    const e = ev('e1', [checklist('c1')])
    expect(isOccurrenceDone(state({ completions: { [occKey('e1', date)]: { status: 'done' } } }), e, date)).toBe(true)
    // (no entries -> falls through to status; with no status it is not done)
    expect(isOccurrenceDone(state(), e, date)).toBe(false)
  })
})

describe('occurrenceEffectiveStatus', () => {
  const date = '2026-06-15'

  it('reports done for a checklist-complete occurrence with no explicit status', () => {
    const e = ev('e1', [checklist('c1', 'x')])
    const s = state({ completions: { [occKey('e1', date)]: { checked: { x: true } } } })
    expect(occurrenceEffectiveStatus(s, e, date)).toBe('done')
  })

  it('falls back to the explicit status, else null', () => {
    const e = ev('e1')
    expect(occurrenceEffectiveStatus(state(), e, date)).toBeNull()
    const skipped = state({ completions: { [occKey('e1', date)]: { status: 'skipped' } } })
    expect(occurrenceEffectiveStatus(skipped, e, date)).toBe('skipped')
  })
})

describe('blockingPrerequisites / occurrenceStatus', () => {
  const depDate = '2026-06-10'
  const date = '2026-06-15'

  function withEdge(prereqDone: boolean): { s: AppState; dependent: CalendarEvent } {
    const prereq = ev('prereq')
    const dependent = ev('dependent')
    const edge: OccurrenceDependency = {
      prerequisiteSeriesId: 'prereq',
      prerequisiteDate: depDate,
      requiredStatus: 'done',
    }
    const completions = prereqDone ? { [occKey('prereq', depDate)]: { status: 'done' as const } } : {}
    return {
      dependent,
      s: state({ events: [prereq, dependent], dependencies: { [occKey('dependent', date)]: [edge] }, completions }),
    }
  }

  it('lists an unmet prerequisite and marks the occurrence blocked', () => {
    const { s, dependent } = withEdge(false)
    expect(blockingPrerequisites(s, dependent, date)).toHaveLength(1)
    expect(occurrenceStatus(s, dependent, date)).toBe('blocked')
  })

  it('clears once the prerequisite reaches its required status', () => {
    const { s, dependent } = withEdge(true)
    expect(blockingPrerequisites(s, dependent, date)).toHaveLength(0)
    expect(occurrenceStatus(s, dependent, date)).toBe('ready')
  })

  it('drops an edge whose prerequisite event no longer exists', () => {
    const dependent = ev('dependent')
    const edge: OccurrenceDependency = {
      prerequisiteSeriesId: 'ghost',
      prerequisiteDate: depDate,
      requiredStatus: 'done',
    }
    const s = state({ events: [dependent], dependencies: { [occKey('dependent', date)]: [edge] } })
    expect(blockingPrerequisites(s, dependent, date)).toHaveLength(0)
  })
})
