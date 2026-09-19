import { NoteProvider } from '@mikrostack/notes'
import { notFound, useLocation, useNavigation, useParams } from '@mikrostack/router'
import { useMemo, useState } from 'react'
import { useAccount } from '../account'
import { PageLoader } from '../assets/ui/Spinner'
import { uid } from '../assets/utils/id'
import { TemplateForm } from '../domains/events/components/TemplateForm'
import {
  type TemplateDraft,
  templateDraftChanged,
  templateDraftFor,
  templateDraftForNew,
  templateDraftValid,
  templateFromTemplateDraft,
} from '../domains/events/draft'
import { useEventsWrite } from '../domains/events/mutations'
import { useTemplates } from '../domains/events/queries'
import { NoteSection } from '../domains/notes/components/NoteSection'
import { NoteToolbar } from '../domains/notes/components/NoteToolbar'
import { useNotesWrite } from '../domains/notes/mutations'
import { useNotes } from '../domains/notes/queries'
import { noteForSeries } from '../domains/notes/selectors'
import { isBlankBody } from '../services/notes/session'
import { useNoteFocus } from '../services/notes/useNoteFocus'
import { useOptionalNote } from '../services/notes/useOptionalNote'
import { EditorPageView } from '../views/EditorPage'
import { KeyboardDockView } from '../views/KeyboardDock'

/**
 * The template editor as a route: `/library/templates/new` and
 * `/library/templates/:id`. Loads the template and its note, hands the form
 * a draft and the note editor, and writes both on save. Closes by going
 * back to the list that opened it, or to the list outright from a deep link.
 */

function useClose() {
  const { navigate, back } = useNavigation()
  const { canGoBack } = useLocation()
  return () => {
    if (canGoBack) back()
    else navigate('/library/templates', { replace: true })
  }
}

export function NewTemplateRoute() {
  const close = useClose()
  return <TemplateSession key="new" initial={templateDraftForNew()} onClose={close} />
}

export function EditTemplateRoute() {
  const { id } = useParams('/library/templates/:id')
  const { accountId } = useAccount()
  const { data: templates, isPending } = useTemplates(accountId)
  const close = useClose()
  const template = templates?.find((t) => t.id === id)
  if (!template) {
    if (isPending) return <PageLoader />
    notFound()
  }
  return (
    <TemplateSession
      key={template.id}
      initial={templateDraftFor(template)}
      id={template.id}
      onClose={close}
    />
  )
}

/** One editing session: holds the draft and the note, writes both on save, composes the page. */
function TemplateSession({
  initial,
  id,
  onClose,
}: {
  initial: TemplateDraft
  /** The template being edited; absent for a new one. */
  id?: string
  onClose: () => void
}) {
  const { accountId, userId } = useAccount()
  const events = useEventsWrite()
  const notes = useNotesWrite()
  const [draft, setDraft] = useState(initial)

  // The template's note, if it has one, edited under its fields. Ticks are
  // not offered: a template's note is content, never state (NOTE_MODEL
  // Decision 10).
  const noteSelect = useMemo(() => noteForSeries(id), [id])
  const { data: existingNote } = useNotes(accountId, noteSelect)
  const note = useOptionalNote({ body: existingNote?.body, deletes: 'tombstone' })
  // The row toolbar only while a note row has the focus.
  const editingNote = useNoteFocus()

  function submit() {
    if (!templateDraftValid(draft) || !changed) return
    // A new template's id is minted here, so editing it again before the
    // first write lands still names a real row — and so its note can name it.
    const templateId = id ?? uid()
    if (templateDraftChanged(draft, initial) || !id) {
      events.mutate({
        accountId,
        userId,
        change: {
          kind: 'saveTemplate',
          isNew: !id,
          template: { ...templateFromTemplateDraft(draft), id: templateId },
        },
      })
    }
    // Second in the app's ordered write queue, so the template exists first.
    // A note the form no longer has is removed; a new one left blank is not
    // written at all.
    const { body } = note.draft()
    if (!note.present) {
      if (existingNote) {
        notes.mutate({ accountId, userId, change: { kind: 'removeNote', id: existingNote.id } })
      }
    } else if (existingNote ? note.changed : !isBlankBody(body)) {
      notes.mutate({
        accountId,
        userId,
        change: {
          kind: 'saveNote',
          isNew: !existingNote,
          note: {
            id: existingNote?.id ?? uid(),
            title: '',
            body,
            ownerSeriesId: templateId,
            authorId: existingNote?.authorId ?? userId,
            updatedAt: new Date().toISOString(),
          },
        },
      })
    }
    onClose()
  }

  // Something to save: the template differs from what was opened, or its
  // note does — added, removed, or edited.
  const noteChanged =
    note.present !== (existingNote !== undefined) || (note.present && note.changed)
  const changed = templateDraftChanged(draft, initial) || noteChanged

  return (
    <NoteProvider store={note.store}>
      <EditorPageView
        onCancel={onClose}
        onSubmit={submit}
        submitLabel="Save"
        // Nothing to save until the form names a template and something
        // differs from what was opened.
        submitDisabled={!templateDraftValid(draft) || !changed}
      >
        <EditorPageView.Title>{id ? 'Edit template' : 'New template'}</EditorPageView.Title>
        <EditorPageView.Body>
          <TemplateForm
            draft={draft}
            onChange={setDraft}
            note={
              <NoteSection
                present={note.present}
                onAdd={note.add}
                onRemove={note.remove}
                ticks={false}
              />
            }
          />
        </EditorPageView.Body>
      </EditorPageView>
      {note.present && editingNote && (
        <KeyboardDockView>
          <KeyboardDockView.Bar>
            <NoteToolbar />
          </KeyboardDockView.Bar>
        </KeyboardDockView>
      )}
    </NoteProvider>
  )
}
