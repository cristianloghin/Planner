import { describe, expect, it } from 'vitest'
import type {
  AppState,
  Attachment,
  CalendarEvent,
  CompletionsMap,
  OccurrenceDependency,
  OccurrenceState,
} from '../types'
import {
  blockingPrerequisites,
  isOccurrenceDone,
  occKey,
  occurrenceEffectiveStatus,
  occurrenceStatus,
  prerequisiteDatesInRange,
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
    expect(isOccurrenceDone({}, e, date)).toBe(false)
    expect(isOccurrenceDone({ [occKey('e1', date)]: { status: 'done' } }, e, date)).toBe(true)
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
    expect(isOccurrenceDone({ [occKey('e1', date)]: { status: 'done' } }, e, date)).toBe(true)
    // (no entries -> falls through to status; with no status it is not done)
    expect(isOccurrenceDone({}, e, date)).toBe(false)
  })
})

describe('occurrenceEffectiveStatus', () => {
  const date = '2026-06-15'

  it('reports done for a checklist-complete occurrence with no explicit status', () => {
    const e = ev('e1', [checklist('c1', 'x')])
    const completions: CompletionsMap = { [occKey('e1', date)]: { checked: { x: true } } }
    expect(occurrenceEffectiveStatus(completions, e, date)).toBe('done')
  })

  it('falls back to the explicit status, else null', () => {
    const e = ev('e1')
    expect(occurrenceEffectiveStatus({}, e, date)).toBeNull()
    const skipped: CompletionsMap = { [occKey('e1', date)]: { status: 'skipped' } }
    expect(occurrenceEffectiveStatus(skipped, e, date)).toBe('skipped')
  })
})

describe('blockingPrerequisites / occurrenceStatus', () => {
  const depDate = '2026-06-10'
  const date = '2026-06-15'

  function withEdge(prereqDone: boolean): {
    s: AppState
    completions: CompletionsMap
    dependent: CalendarEvent
  } {
    const prereq = ev('prereq')
    const dependent = ev('dependent')
    const edge: OccurrenceDependency = {
      prerequisiteSeriesId: 'prereq',
      prerequisiteDate: depDate,
      requiredStatus: 'done',
    }
    const completions: CompletionsMap = prereqDone
      ? { [occKey('prereq', depDate)]: { status: 'done' as const } }
      : {}
    return {
      dependent,
      completions,
      s: state({
        events: [prereq, dependent],
        dependencies: { [occKey('dependent', date)]: [edge] },
      }),
    }
  }

  it('lists an unmet prerequisite and marks the occurrence blocked', () => {
    const { s, completions, dependent } = withEdge(false)
    expect(blockingPrerequisites(s, completions, dependent, date)).toHaveLength(1)
    expect(occurrenceStatus(s, completions, dependent, date)).toBe('blocked')
  })

  it('clears once the prerequisite reaches its required status', () => {
    const { s, completions, dependent } = withEdge(true)
    expect(blockingPrerequisites(s, completions, dependent, date)).toHaveLength(0)
    expect(occurrenceStatus(s, completions, dependent, date)).toBe('ready')
  })

  it('drops an edge whose prerequisite event no longer exists', () => {
    const dependent = ev('dependent')
    const edge: OccurrenceDependency = {
      prerequisiteSeriesId: 'ghost',
      prerequisiteDate: depDate,
      requiredStatus: 'done',
    }
    const s = state({ events: [dependent], dependencies: { [occKey('dependent', date)]: [edge] } })
    expect(blockingPrerequisites(s, {}, dependent, date)).toHaveLength(0)
  })
})

describe('prerequisiteDatesInRange', () => {
  it('collects prerequisite dates for dependents inside the range only', () => {
    const dependencies: AppState['dependencies'] = {
      [occKey('a', '2026-06-15')]: [
        { prerequisiteSeriesId: 'p', prerequisiteDate: '2026-04-01', requiredStatus: 'done' },
      ],
      [occKey('b', '2026-07-20')]: [
        { prerequisiteSeriesId: 'p', prerequisiteDate: '2026-07-19', requiredStatus: 'done' },
      ],
    }
    expect(prerequisiteDatesInRange(dependencies, '2026-06-01', '2026-06-30')).toEqual([
      '2026-04-01',
    ])
    expect(prerequisiteDatesInRange(dependencies, '2026-06-01', '2026-07-31')).toEqual([
      '2026-04-01',
      '2026-07-19',
    ])
  })
})
