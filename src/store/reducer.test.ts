import { describe, expect, it } from 'vitest'
import type { AppState, CalendarEvent, ListItem, TodoList } from '../types'
import { reducer } from './reducer'

function item(over: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    title: 'Buy milk',
    done: false,
    personId: null,
    groupLabel: null,
    dueOn: null,
    sortOrder: 0,
    createdAt: 0,
    ...over,
  }
}

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
    people: {},
    lists: [],
    events: [],
    dependencies: {},
    listLinks: {},
    preferences: { personColors: {} },
    weekStart: '2026-07-06', // a Monday
    selectedDay: 0,
    ...over,
  }
}

describe('lists', () => {
  it('appends a new list with the next sortOrder, keeping the caller-minted id', () => {
    const state = baseState({ lists: [{ id: 'l1', title: 'A', sortOrder: 0, items: [] }] })
    const next = reducer(state, { type: 'addList', title: 'B', id: 'l2' })
    expect(next.lists.map((l) => l.id)).toEqual(['l1', 'l2'])
    expect(next.lists[1].sortOrder).toBe(1)
  })

  it('appends an item at the end of its list with the next sortOrder', () => {
    const lists: TodoList[] = [{ id: 'l1', title: 'A', sortOrder: 0, items: [item()] }]
    const next = reducer(baseState({ lists }), {
      type: 'addListItem',
      listId: 'l1',
      title: 'Eggs',
      personId: null,
      group: null,
      dueOn: null,
      id: 'i2',
    })
    expect(next.lists[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(next.lists[0].items[1].sortOrder).toBe(1)
  })

  it('removing a list also drops its items from occurrence links (mirrors the DB cascade)', () => {
    const lists: TodoList[] = [
      { id: 'l1', title: 'A', sortOrder: 0, items: [item({ id: 'a' }), item({ id: 'b' })] },
    ]
    const listLinks = { 'e1:2026-07-06': ['a', 'x'], 'e2:2026-07-07': ['b'] }
    const next = reducer(baseState({ lists, listLinks }), { type: 'removeList', id: 'l1' })
    expect(next.lists).toEqual([])
    // 'a' is filtered out; 'e2's key emptied out entirely and is dropped.
    expect(next.listLinks).toEqual({ 'e1:2026-07-06': ['x'] })
  })

  it('removing one item drops only its links', () => {
    const lists: TodoList[] = [{ id: 'l1', title: 'A', sortOrder: 0, items: [item({ id: 'a' })] }]
    const listLinks = { 'e1:2026-07-06': ['a', 'x'] }
    const next = reducer(baseState({ lists, listLinks }), {
      type: 'removeListItem',
      listId: 'l1',
      itemId: 'a',
    })
    expect(next.lists[0].items).toEqual([])
    expect(next.listLinks).toEqual({ 'e1:2026-07-06': ['x'] })
  })
})

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
      listLinks: { 'e1:2026-07-06': ['a'], 'e2:2026-07-07': ['b'] },
    })
    const next = reducer(state, { type: 'removeEvent', id: 'e1' })
    expect(next.events.map((e) => e.id)).toEqual(['e2'])
    expect(next.dependencies).toEqual({
      'e2:2026-07-07': [
        { prerequisiteSeriesId: 'e3', prerequisiteDate: '2026-07-06', requiredStatus: 'done' },
      ],
    })
    expect(next.listLinks).toEqual({ 'e2:2026-07-07': ['b'] })
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

  it('linkListItem is idempotent; unlinking the last item drops the key', () => {
    const state = baseState({ listLinks: { 'e1:2026-07-06': ['a'] } })
    const relinked = reducer(state, {
      type: 'linkListItem',
      eventId: 'e1',
      date: '2026-07-06',
      itemId: 'a',
    })
    expect(relinked).toBe(state)
    const unlinked = reducer(state, {
      type: 'unlinkListItem',
      eventId: 'e1',
      date: '2026-07-06',
      itemId: 'a',
    })
    expect(unlinked.listLinks).toEqual({})
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

describe('preferences', () => {
  it('setWeekLayout stores the choice without touching other preferences', () => {
    const state = baseState({
      preferences: { personColors: { kid: '3' }, timezone: 'Europe/Bucharest' },
    })
    const next = reducer(state, { type: 'setWeekLayout', layout: 'timeline' })
    expect(next.preferences.weekLayout).toBe('timeline')
    expect(next.preferences.personColors).toEqual({ kid: '3' })
    expect(next.preferences.timezone).toBe('Europe/Bucharest')
  })
})
