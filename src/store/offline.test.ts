import { beforeEach, describe, expect, it } from 'vitest'
import type { AppState, CalendarEvent } from '../types'
import {
  clearSnapshot,
  enrichForQueue,
  isNetworkError,
  isPersistedAction,
  readQueue,
  readSnapshot,
  writeQueue,
  writeSnapshot,
} from './offline'

// Node test env has no localStorage; a Map-backed stub is enough.
function stubStorage() {
  const map = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
  return map
}

function ev(id: string): CalendarEvent {
  return {
    id,
    title: id,
    start: '2026-06-15',
    allDay: true,
    duration: 1,
    attendees: [],
    attachments: [],
  }
}

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

describe('enrichForQueue', () => {
  it('backfills the minted id onto a queued addEvent', () => {
    const next = state({ events: [ev('a'), ev('b')] })
    const queued = enrichForQueue(
      { type: 'addEvent', event: { ...ev('x'), id: undefined } as never },
      next,
    )
    expect(queued).toMatchObject({ type: 'addEvent', id: 'b' })
  })

  it('keeps a caller-minted id', () => {
    const next = state({ events: [ev('a')] })
    const queued = enrichForQueue({ type: 'addEvent', event: {} as never, id: 'mine' }, next)
    expect(queued).toMatchObject({ id: 'mine' })
  })

  it('backfills the appended item id onto addListItem', () => {
    const next = state({
      lists: [
        {
          id: 'l1',
          title: 'L',
          sortOrder: 0,
          items: [
            {
              id: 'i1',
              title: 'a',
              done: false,
              personId: null,
              groupLabel: null,
              dueOn: null,
              sortOrder: 0,
              createdAt: 0,
            },
            {
              id: 'i2',
              title: 'b',
              done: false,
              personId: null,
              groupLabel: null,
              dueOn: null,
              sortOrder: 1,
              createdAt: 0,
            },
          ],
        },
      ],
    })
    const queued = enrichForQueue(
      { type: 'addListItem', listId: 'l1', title: 'b', personId: null, group: null, dueOn: null },
      next,
    )
    expect(queued).toMatchObject({ type: 'addListItem', id: 'i2' })
  })

  it('passes every other action through untouched', () => {
    const action = { type: 'removeEvent', id: 'x' } as const
    expect(enrichForQueue(action, state())).toBe(action)
  })
})

describe('isPersistedAction', () => {
  it('filters UI navigation, keeps data writes', () => {
    expect(isPersistedAction({ type: 'setDay', day: 2 })).toBe(false)
    expect(isPersistedAction({ type: 'shiftWeek', delta: 1 })).toBe(false)
    expect(isPersistedAction({ type: 'removeEvent', id: 'x' })).toBe(true)
    expect(isPersistedAction({ type: 'renameList', id: 'l', title: 't' })).toBe(true)
  })
})

describe('isNetworkError', () => {
  it('recognises fetch-layer failures', () => {
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'fetch failed' })).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
  })

  it('treats server rejections as non-network', () => {
    expect(isNetworkError({ message: 'duplicate key value violates unique constraint' })).toBe(
      false,
    )
    expect(isNetworkError({ message: 'new row violates row-level security policy' })).toBe(false)
  })
})

describe('snapshot & queue storage', () => {
  beforeEach(() => {
    stubStorage()
  })

  it('round-trips the data fields of a snapshot', () => {
    const s = state({ events: [ev('a')], weekStart: '2020-01-06', selectedDay: 3 })
    writeSnapshot('acct', s)
    const snap = readSnapshot('acct')
    expect(snap?.events).toHaveLength(1)
    // Navigation fields are per-session and must not round-trip.
    expect(snap).not.toHaveProperty('weekStart')
    clearSnapshot('acct')
    expect(readSnapshot('acct')).toBeNull()
  })

  it('rejects a corrupt snapshot instead of wedging startup', () => {
    localStorage.setItem('planner.snapshot.v1.acct', '{"events": "nope"}')
    expect(readSnapshot('acct')).toBeNull()
    localStorage.setItem('planner.snapshot.v1.acct', 'not json')
    expect(readSnapshot('acct')).toBeNull()
  })

  it('round-trips the queue and clears the key when empty', () => {
    writeQueue('acct', [{ type: 'removeEvent', id: 'x' }])
    expect(readQueue('acct')).toEqual([{ type: 'removeEvent', id: 'x' }])
    writeQueue('acct', [])
    expect(localStorage.getItem('planner.pendingWrites.v1.acct')).toBeNull()
    expect(readQueue('acct')).toEqual([])
  })
})
