import { describe, expect, it } from 'vitest'
import type { AppState, ListItem, TodoList } from '../types'
import { addDays, toISODate } from './dates'
import { findListItem, isOverdue } from './lists'

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

function stateWithLists(lists: TodoList[]): AppState {
  return {
    people: {},
    lists,
    events: [],
    dependencies: {},
    listLinks: {},
    preferences: { personColors: {} },
    weekStart: '2026-06-15',
    selectedDay: 0,
  }
}

describe('findListItem', () => {
  const state = stateWithLists([
    { id: 'l1', title: 'Home', sortOrder: 0, items: [item({ id: 'a' }), item({ id: 'b' })] },
    { id: 'l2', title: 'Work', sortOrder: 1, items: [item({ id: 'c' })] },
  ])

  it('locates an item and its owning list across all lists', () => {
    const found = findListItem(state, 'c')
    expect(found?.list.id).toBe('l2')
    expect(found?.item.id).toBe('c')
  })

  it('returns null for an unknown id', () => {
    expect(findListItem(state, 'nope')).toBeNull()
  })
})

describe('isOverdue', () => {
  const today = toISODate(new Date())

  it('is false when there is no deadline', () => {
    expect(isOverdue(item({ dueOn: null }))).toBe(false)
  })

  it('is false for a deadline today or in the future', () => {
    expect(isOverdue(item({ dueOn: today }))).toBe(false)
    expect(isOverdue(item({ dueOn: addDays(today, 1) }))).toBe(false)
  })

  it('is true for an open item past its deadline', () => {
    expect(isOverdue(item({ dueOn: addDays(today, -1) }))).toBe(true)
  })

  it('is false once a past-deadline item is done', () => {
    expect(isOverdue(item({ dueOn: addDays(today, -1), done: true }))).toBe(false)
  })
})
