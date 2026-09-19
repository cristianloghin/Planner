import { NoteProvider } from '@mikrostack/notes'
import { notFound, useLocation, useNavigation, useParams } from '@mikrostack/router'
import { useMemo } from 'react'
import { useAccount } from '../account'
import { PageLoader } from '../assets/ui/Spinner'
import { uid } from '../assets/utils/id'
import { emptyBody } from '../client/notes'
import { NoteEditor } from '../domains/notes/components/NoteEditor'
import { NoteToolbar } from '../domains/notes/components/NoteToolbar'
import { useNotesWrite } from '../domains/notes/mutations'
import { useNotes } from '../domains/notes/queries'
import { noteFor } from '../domains/notes/selectors'
import type { NoteBody } from '../domains/notes/types'
import { useNoteSession } from '../services/notes/useNoteSession'
import { EditorPageView } from '../views/EditorPage'
import { KeyboardDockView } from '../views/KeyboardDock'

/**
 * A standalone note as a route: `/library/notes/new` and `/library/notes/:id`.
 * In the shape of the template editor: the page opens the note, the user
 * edits, and Save writes it whole and closes. Closing goes back to the list
 * that opened it, or to the list outright from a deep link.
 */

function useClose() {
  const { navigate, back } = useNavigation()
  const { canGoBack } = useLocation()
  return () => {
    if (canGoBack) back()
    else navigate('/library/notes', { replace: true })
  }
}

export function NewNoteRoute() {
  const close = useClose()
  return <NoteSession key="new" initial={{ title: '', body: emptyBody() }} onClose={close} />
}

export function EditNoteRoute() {
  const { id } = useParams('/library/notes/:id')
  const { accountId } = useAccount()
  const select = useMemo(() => noteFor(id), [id])
  const { data: note, isPending } = useNotes(accountId, select)
  const close = useClose()
  if (!note) {
    if (isPending) return <PageLoader />
    notFound()
  }
  return (
    <NoteSession
      key={note.id}
      id={note.id}
      initial={{ title: note.title, body: note.body, authorId: note.authorId }}
      onClose={close}
    />
  )
}

/** One editing session: the editor over the note as opened, written on save. */
function NoteSession({
  initial,
  id,
  onClose,
}: {
  initial: { title: string; body: NoteBody; authorId?: string }
  /** The note being edited; absent for a new one. */
  id?: string
  onClose: () => void
}) {
  const { accountId, userId } = useAccount()
  const write = useNotesWrite()
  const { store, title, setTitle, changed, draft } = useNoteSession({
    title: initial.title,
    body: initial.body,
    // A standalone note has no overrides, so a removed row is gone for good.
    deletes: 'drop',
  })

  function submit() {
    if (!changed) return
    const { title, body } = draft()
    write.mutate({
      accountId,
      userId,
      change: {
        kind: 'saveNote',
        isNew: !id,
        note: {
          // A new note's id is minted here, so the row is named before it exists.
          id: id ?? uid(),
          title,
          body,
          ownerSeriesId: null,
          authorId: initial.authorId ?? userId,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    onClose()
  }

  return (
    <NoteProvider store={store}>
      <EditorPageView
        onCancel={onClose}
        onSubmit={submit}
        submitLabel="Save"
        // Nothing to save until something differs from what was opened.
        submitDisabled={!changed}
      >
        <EditorPageView.Title>{id ? 'Edit note' : 'New note'}</EditorPageView.Title>
        <EditorPageView.Body>
          <input
            placeholder="Title"
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <NoteEditor />
        </EditorPageView.Body>
      </EditorPageView>
      <KeyboardDockView>
        <KeyboardDockView.Bar>
          <NoteToolbar />
        </KeyboardDockView.Bar>
      </KeyboardDockView>
    </NoteProvider>
  )
}
