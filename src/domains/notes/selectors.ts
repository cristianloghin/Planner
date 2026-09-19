/**
 * Ways for a screen to ask for part of the notes list.
 *
 * The plain ones take the list and can be passed straight into `useNotes`.
 * The ones ending in `For` take an argument first and build a function, so
 * hold the result steady with `useMemo`.
 */
import type { Note } from './types'

/** The notes that stand on their own — the Library's notes. */
export function standaloneNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.ownerSeriesId === null)
}

/** One note, or undefined if the account has no such note. */
export function noteFor(id: string) {
  return (notes: Note[]): Note | undefined => notes.find((n) => n.id === id)
}

/**
 * The standalone notes split into this user's and everyone else's. Order is
 * kept as given, most recently saved first.
 */
export function standaloneByAuthorFor(userId: string) {
  return (notes: Note[]): { mine: Note[]; theirs: Note[] } => {
    const mine: Note[] = []
    const theirs: Note[] = []
    for (const n of standaloneNotes(notes)) (n.authorId === userId ? mine : theirs).push(n)
    return { mine, theirs }
  }
}
