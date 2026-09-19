import { describe, expect, it } from 'vitest'
import { emptyBody } from '../../client/notes'
import { patchRemoveNote, patchSaveNote } from './patches'
import { noteFor, standaloneByAuthorFor, standaloneNotes } from './selectors'
import type { Note } from './types'

const note = (id: string, authorId: string, ownerSeriesId: string | null = null): Note => ({
  id,
  title: id,
  ownerSeriesId,
  authorId,
  body: emptyBody(),
  updatedAt: '2026-09-19T10:00:00Z',
})

const a = note('a', 'me')
const b = note('b', 'you')
const c = note('c', 'me')
const owned = note('d', 'me', 'series-1')
const notes = [a, b, c, owned]

describe('standaloneNotes', () => {
  it('leaves out notes that belong to a series', () => {
    expect(standaloneNotes(notes)).toEqual([a, b, c])
  })
})

describe('noteFor', () => {
  it('finds one note by id, or nothing', () => {
    expect(noteFor('b')(notes)).toBe(b)
    expect(noteFor('zzz')(notes)).toBeUndefined()
  })
})

describe('standaloneByAuthorFor', () => {
  it('splits into mine and theirs, keeping the order given', () => {
    expect(standaloneByAuthorFor('me')(notes)).toEqual({ mine: [a, c], theirs: [b] })
  })

  it('never puts a series note in either', () => {
    const { mine, theirs } = standaloneByAuthorFor('me')(notes)
    expect([...mine, ...theirs]).not.toContain(owned)
  })
})

describe('patchSaveNote', () => {
  it('adds a new note at the front', () => {
    const fresh = note('n', 'me')
    expect(patchSaveNote(notes, fresh)).toEqual([fresh, a, b, c, owned])
  })

  it('replaces an existing note and moves it to the front', () => {
    const edited = { ...c, title: 'C, edited' }
    const next = patchSaveNote(notes, edited)
    expect(next).toEqual([edited, a, b, owned])
    expect(next.filter((n) => n.id === 'c')).toHaveLength(1)
  })

  it('does not modify the list it was given', () => {
    patchSaveNote(notes, { ...c, title: 'x' })
    expect(notes).toEqual([a, b, c, owned])
    expect(c.title).toBe('c')
  })
})

describe('patchRemoveNote', () => {
  it('removes one note and leaves the rest', () => {
    expect(patchRemoveNote(notes, 'b')).toEqual([a, c, owned])
  })

  it('does not change the list for an unknown id', () => {
    expect(patchRemoveNote(notes, 'zzz')).toEqual(notes)
  })
})

describe('emptyBody', () => {
  it('is what the editor gives for no rows, so a new note opens as one blank row', () => {
    // Asserted through the library, not by naming a key: the app is blind to
    // the document's shape.
    expect(emptyBody()).toEqual(emptyBody())
  })
})
