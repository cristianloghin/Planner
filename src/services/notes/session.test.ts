import { NoteStore, parseDoc, serializeDoc } from '@mikrostack/notes'
import { describe, expect, it } from 'vitest'
import type { NoteBody } from '../../client/notes'
import {
  NOTHING_UNSAVED,
  type Unsaved,
  hasChanges,
  isBlankBody,
  pendingBody,
  recordEdit,
  recordTitle,
} from './session'

/**
 * An editor over a saved document, recording every edit the way the hook
 * does. `rows()` is what the user sees; `body()` is what would be saved.
 */
function editor(saved: NoteBody, deletes: 'tombstone' | 'drop' = 'drop') {
  let n = 0
  const store = new NoteStore({ initial: parseDoc(saved), genId: () => `new-${++n}` })
  let unsaved: Unsaved = NOTHING_UNSAVED
  store.onAction((action, prev, next) => {
    unsaved = recordEdit(unsaved, saved, action, prev, next, deletes)
  })
  return {
    store,
    get unsaved() {
      return unsaved
    },
    rows: () => store.getState().rows,
    body: () => pendingBody(saved, unsaved),
  }
}

const saved = serializeDoc([
  { id: 'h', type: 'header', text: 'Hardware' },
  { id: 'a', type: 'item', text: 'screws', done: false },
  { id: 'b', type: 'item', text: 'hinges', done: false },
])

describe('pendingBody', () => {
  it('is the saved document itself while nothing has been edited', () => {
    expect(pendingBody(saved, NOTHING_UNSAVED)).toBe(saved)
  })

  it('shows exactly what the editor shows after a run of edits', () => {
    const e = editor(saved)
    e.store.dispatch({ type: 'toggleDone', id: 'a' })
    e.store.dispatch({ type: 'split', id: 'b', offset: 6 })
    e.store.dispatch({ type: 'setText', id: 'new-1', text: 'glue' })
    e.store.dispatch({ type: 'move', id: 'new-1', toIndex: 1 })
    expect(parseDoc(e.body())).toEqual(e.rows())
    expect(e.unsaved.patches).toHaveLength(4)
  })

  it('replays unsaved edits on top of a newer copy from another device', () => {
    const e = editor(saved)
    e.store.dispatch({ type: 'toggleDone', id: 'a' })
    // Meanwhile a partner renamed a row and saved; that copy arrives.
    const theirs = serializeDoc(
      parseDoc(saved).map((r) => (r.id === 'b' ? { ...r, text: 'brass hinges' } : r)),
      saved,
    )
    const merged = parseDoc(pendingBody(theirs, e.unsaved))
    expect(merged.find((r) => r.id === 'a')).toMatchObject({ done: true })
    expect(merged.find((r) => r.id === 'b')).toMatchObject({ text: 'brass hinges' })
  })
})

describe('recordEdit', () => {
  it('drops a removed row outright when asked, leaving nothing behind', () => {
    const e = editor(saved, 'drop')
    e.store.dispatch({ type: 'remove', id: 'b' })
    expect(parseDoc(e.body()).map((r) => r.id)).toEqual(['h', 'a'])
    // Nothing is asserted about the document's keys: the app cannot see them.
    expect(JSON.stringify(e.body())).not.toContain('"b"')
  })

  it('keeps a removed row as a tombstone by default', () => {
    const e = editor(saved, 'tombstone')
    e.store.dispatch({ type: 'remove', id: 'b' })
    expect(parseDoc(e.body()).map((r) => r.id)).toEqual(['h', 'a'])
    expect(JSON.stringify(e.body())).toContain('"b"')
  })

  it('does not modify what it was given', () => {
    const e = editor(saved)
    const before = e.unsaved
    e.store.dispatch({ type: 'toggleDone', id: 'a' })
    expect(before).toEqual(NOTHING_UNSAVED)
    expect(saved).toEqual(serializeDoc(parseDoc(saved), saved))
  })
})

describe('the title and hasChanges', () => {
  it('counts a changed title or any edit, and a title typed back to what it was as nothing', () => {
    expect(hasChanges(NOTHING_UNSAVED, 'Shopping')).toBe(false)
    expect(hasChanges(recordTitle(NOTHING_UNSAVED, 'Shopping list'), 'Shopping')).toBe(true)
    expect(hasChanges(recordTitle(NOTHING_UNSAVED, 'Shopping'), 'Shopping')).toBe(false)
    expect(hasChanges({ patches: [{}] }, 'Shopping')).toBe(true)
  })

  it('keeps the patches when the title changes', () => {
    const e = editor(saved)
    e.store.dispatch({ type: 'toggleDone', id: 'a' })
    const next = recordTitle(e.unsaved, 'Shopping')
    expect(next.title).toBe('Shopping')
    expect(next.patches).toHaveLength(1)
  })
})

describe('isBlankBody', () => {
  it('is blank with no rows, or rows that say nothing', () => {
    expect(isBlankBody(serializeDoc([]))).toBe(true)
    expect(isBlankBody(serializeDoc([{ id: 'a', type: 'item', text: '   ', done: false }]))).toBe(
      true,
    )
  })

  it('is not blank once any row has text', () => {
    expect(isBlankBody(saved)).toBe(false)
    expect(isBlankBody(serializeDoc([{ id: 'h', type: 'header', text: 'Tools' }]))).toBe(false)
  })
})
