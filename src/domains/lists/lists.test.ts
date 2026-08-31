import { describe, expect, it } from 'vitest'
import {
  patchAddItem,
  patchAddList,
  patchEditItem,
  patchLink,
  patchRemoveItem,
  patchRemoveList,
  patchRenameList,
  patchSetItemDone,
  patchSetItemDue,
  patchUnlink,
} from './patches'
import { findItemFor, isOverdue, itemsByIdFor, itemsOfFor, listFor } from './selectors'
import { linksByOccurrence, nestItems } from './transformers'
import type { ListItem, ListItemRow, TodoList } from './types'

const item = (id: string, listId: string, sortOrder: number, over: Partial<ListItem> = {}) =>
  ({
    id,
    listId,
    title: id,
    done: false,
    personId: null,
    groupLabel: null,
    dueOn: null,
    sortOrder,
    createdAt: 0,
    ...over,
  }) as ListItemRow

const lists = [
  { id: 'L1', title: 'Shopping', sortOrder: 0 },
  { id: 'L2', title: 'House', sortOrder: 1 },
]

describe('nestItems', () => {
  it('puts each to-do under its list, in order', () => {
    const nested = nestItems(lists, [item('b', 'L1', 1), item('a', 'L1', 0), item('c', 'L2', 0)])
    expect(nested.map((l) => l.id)).toEqual(['L1', 'L2'])
    expect(nested[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(nested[1].items.map((i) => i.id)).toEqual(['c'])
  })

  it('keeps a list that has nothing in it', () => {
    const nested = nestItems(lists, [item('a', 'L1', 0)])
    expect(nested[1]).toEqual({ id: 'L2', title: 'House', sortOrder: 1, items: [] })
  })

  it('drops to-dos whose list is gone rather than inventing one', () => {
    expect(nestItems(lists, [item('x', 'L-gone', 0)]).every((l) => l.items.length === 0)).toBe(true)
  })

  it('does not reorder the array it was given', () => {
    const items = [item('b', 'L1', 1), item('a', 'L1', 0)]
    nestItems(lists, items)
    expect(items.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('linksByOccurrence', () => {
  it('groups pinned to-dos by the day they show on', () => {
    expect(
      linksByOccurrence([
        { listItemId: 'i1', seriesId: 'S', date: '2026-04-01' },
        { listItemId: 'i2', seriesId: 'S', date: '2026-04-01' },
        { listItemId: 'i3', seriesId: 'S', date: '2026-04-02' },
      ]),
    ).toEqual({ 'S:2026-04-01': ['i1', 'i2'], 'S:2026-04-02': ['i3'] })
  })

  it('is empty when nothing is pinned', () => {
    expect(linksByOccurrence([])).toEqual({})
  })
})

const nested: TodoList[] = nestItems(lists, [
  item('a', 'L1', 0),
  item('b', 'L1', 1, { done: true }),
  item('c', 'L2', 0),
])

describe('selectors', () => {
  it('finds one list and its to-dos', () => {
    expect(listFor('L2')(nested)?.title).toBe('House')
    expect(listFor('gone')(nested)).toBeUndefined()
    expect(itemsOfFor('L1')(nested).map((i) => i.id)).toEqual(['a', 'b'])
    expect(itemsOfFor('gone')(nested)).toEqual([])
  })

  it('finds a to-do and its list from the id alone', () => {
    expect(findItemFor('c')(nested)?.list.id).toBe('L2')
    expect(findItemFor('gone')(nested)).toBeUndefined()
  })

  it('collects the to-dos pinned to a day, wherever they live', () => {
    expect(itemsByIdFor(['a', 'c'])(nested).map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('isOverdue', () => {
  const today = new Date().toISOString().slice(0, 10)

  it('is false without a deadline', () => {
    expect(isOverdue(item('a', 'L1', 0))).toBe(false)
  })

  it('is false on the day itself', () => {
    expect(isOverdue(item('a', 'L1', 0, { dueOn: today }))).toBe(false)
  })

  it('is true once an open to-do is past its deadline', () => {
    expect(isOverdue(item('a', 'L1', 0, { dueOn: '2020-01-01' }))).toBe(true)
  })

  it('is false once it is done, however late', () => {
    expect(isOverdue(item('a', 'L1', 0, { dueOn: '2020-01-01', done: true }))).toBe(false)
  })
})

describe('patches', () => {
  it('adds a list in its place in the order', () => {
    const added = patchAddList(nested, { id: 'L0', title: 'Top', sortOrder: -1, items: [] })
    expect(added.map((l) => l.id)).toEqual(['L0', 'L1', 'L2'])
  })

  it('renames a list and removes one with its to-dos', () => {
    expect(patchRenameList(nested, 'L1', 'Food')[0].title).toBe('Food')
    expect(patchRemoveList(nested, 'L1').map((l) => l.id)).toEqual(['L2'])
  })

  it('adds a to-do to the end of its list', () => {
    const added = patchAddItem(nested, 'L2', item('d', 'L2', 1))
    expect(added[1].items.map((i) => i.id)).toEqual(['c', 'd'])
    expect(added[0]).toBe(nested[0])
  })

  it('ticks, edits and dates a to-do wherever it is', () => {
    expect(patchSetItemDone(nested, 'a', true)[0].items[0].done).toBe(true)
    expect(
      patchEditItem(nested, 'c', { title: 'Bins', personId: 'p1', groupLabel: 'Weekly' })[1]
        .items[0],
    ).toMatchObject({ title: 'Bins', personId: 'p1', groupLabel: 'Weekly' })
    expect(patchSetItemDue(nested, 'a', '2026-05-01')[0].items[0].dueOn).toBe('2026-05-01')
  })

  it('removes a to-do without touching other lists', () => {
    const removed = patchRemoveItem(nested, 'a')
    expect(removed[0].items.map((i) => i.id)).toEqual(['b'])
    expect(removed[1]).toBe(nested[1])
  })

  it('leaves an unknown id alone', () => {
    expect(patchSetItemDone(nested, 'gone', true)).toEqual(nested)
    expect(patchRemoveItem(nested, 'gone')).toEqual(nested)
  })

  it('does not modify what it was given', () => {
    patchSetItemDone(nested, 'a', true)
    patchRemoveItem(nested, 'a')
    expect(nested[0].items.map((i) => `${i.id}:${i.done}`)).toEqual(['a:false', 'b:true'])
  })
})

describe('pinning patches', () => {
  const links = { 'S:2026-04-01': ['i1'] }

  it('pins a to-do to a day, and to a day with nothing on it', () => {
    expect(patchLink(links, 'S:2026-04-01', 'i2')).toEqual({ 'S:2026-04-01': ['i1', 'i2'] })
    expect(patchLink(links, 'S:2026-04-02', 'i9')).toEqual({
      'S:2026-04-01': ['i1'],
      'S:2026-04-02': ['i9'],
    })
  })

  it('pinning the same to-do twice changes nothing', () => {
    expect(patchLink(links, 'S:2026-04-01', 'i1')).toBe(links)
  })

  it('unpins, and drops the day once nothing is left on it', () => {
    expect(patchUnlink({ 'S:2026-04-01': ['i1', 'i2'] }, 'S:2026-04-01', 'i1')).toEqual({
      'S:2026-04-01': ['i2'],
    })
    expect(patchUnlink(links, 'S:2026-04-01', 'i1')).toEqual({})
  })

  it('unpinning something that was never pinned changes nothing', () => {
    expect(patchUnlink(links, 'S:2026-04-09', 'i1')).toBe(links)
    expect(patchUnlink(links, 'S:2026-04-01', 'nope')).toEqual(links)
  })
})
