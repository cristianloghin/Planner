import { describe, expect, it } from 'vitest'
import type { AppState, CalendarEvent } from '../types'
import { reducer } from './reducer'

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title: 'Swim class',
    start: '2026-07-06T09:00',
    allDay: false,
    duration: 60,
    attendees: ['kid'],
    attachments: [],
    ...over,
  }
}

function baseState(over: Partial<AppState> = {}): AppState {
  return {
    events: [],
    dependencies: {},
    weekStart: '2026-07-06', // a Monday
    selectedDay: 0,
    ...over,
  }
}

describe('events', () => {
  it('removeEvent drops the event, both directions of its dependency edges, and its to-do links', () => {
    const dependencies = {
      // e1 is the dependent: whole key goes.
      'e1:2026-07-06': [
        {
          prerequisiteSeriesId: 'e2',
          prerequisiteDate: '2026-07-05',
          requiredStatus: 'done' as const,
        },
      ],
      // e1 is one of two prerequisites: only its edge goes.
      'e2:2026-07-07': [
        {
          prerequisiteSeriesId: 'e1',
          prerequisiteDate: '2026-07-06',
          requiredStatus: 'done' as const,
        },
        {
          prerequisiteSeriesId: 'e3',
          prerequisiteDate: '2026-07-06',
          requiredStatus: 'done' as const,
        },
      ],
    }
    const state = baseState({
      events: [event(), event({ id: 'e2' })],
      dependencies,
    })
    const next = reducer(state, { type: 'removeEvent', id: 'e1' })
    expect(next.events.map((e) => e.id)).toEqual(['e2'])
    expect(next.dependencies).toEqual({
      'e2:2026-07-07': [
        { prerequisiteSeriesId: 'e3', prerequisiteDate: '2026-07-06', requiredStatus: 'done' },
      ],
    })
  })

  it('splitSeries caps the old series the day before the split and appends the clone', () => {
    const recurring = event({ recurrence: { freq: 'weekly', interval: 1 } })
    const state = baseState({ events: [recurring] })
    const next = reducer(state, {
      type: 'splitSeries',
      eventId: 'e1',
      fromDate: '2026-07-20',
      event: { ...recurring, id: undefined, title: 'Swim class (new time)' } as never,
    })
    expect(next.events).toHaveLength(2)
    expect(next.events[0].recurrence?.until).toBe('2026-07-19')
    expect(next.events[1].title).toBe('Swim class (new time)')
    expect(next.events[1].id).not.toBe('e1')
  })

  it('splitSeries is a no-op for a non-recurring event', () => {
    const state = baseState({ events: [event()] })
    const next = reducer(state, {
      type: 'splitSeries',
      eventId: 'e1',
      fromDate: '2026-07-20',
      event: event() as never,
    })
    expect(next).toBe(state)
  })
})

describe('dependencies and links', () => {
  it('re-adding a dependency for the same prerequisite slot replaces it (updates the required status)', () => {
    const state = baseState({
      dependencies: {
        'e1:2026-07-06': [
          {
            prerequisiteSeriesId: 'e2',
            prerequisiteDate: '2026-07-05',
            requiredStatus: 'done' as const,
          },
        ],
      },
    })
    const next = reducer(state, {
      type: 'addDependency',
      eventId: 'e1',
      date: '2026-07-06',
      prerequisiteSeriesId: 'e2',
      prerequisiteDate: '2026-07-05',
      requiredStatus: 'skipped',
    })
    expect(next.dependencies['e1:2026-07-06']).toEqual([
      { prerequisiteSeriesId: 'e2', prerequisiteDate: '2026-07-05', requiredStatus: 'skipped' },
    ])
  })

  it('removing the last dependency edge drops the key entirely', () => {
    const state = baseState({
      dependencies: {
        'e1:2026-07-06': [
          {
            prerequisiteSeriesId: 'e2',
            prerequisiteDate: '2026-07-05',
            requiredStatus: 'done' as const,
          },
        ],
      },
    })
    const next = reducer(state, {
      type: 'removeDependency',
      eventId: 'e1',
      date: '2026-07-06',
      prerequisiteSeriesId: 'e2',
      prerequisiteDate: '2026-07-05',
    })
    expect(next.dependencies).toEqual({})
  })
})

describe('navigation', () => {
  it('shiftDay wraps backwards into the previous week', () => {
    const next = reducer(baseState({ selectedDay: 0 }), { type: 'shiftDay', delta: -1 })
    expect(next.selectedDay).toBe(6)
    expect(next.weekStart).toBe('2026-06-29')
  })

  it('shiftDay wraps forwards into the next week', () => {
    const next = reducer(baseState({ selectedDay: 6 }), { type: 'shiftDay', delta: 1 })
    expect(next.selectedDay).toBe(0)
    expect(next.weekStart).toBe('2026-07-13')
  })

  it('goToDate lands on the containing week with that day selected', () => {
    const next = reducer(baseState(), { type: 'goToDate', date: '2026-07-23' }) // a Thursday
    expect(next.weekStart).toBe('2026-07-20')
    expect(next.selectedDay).toBe(3)
  })
})
