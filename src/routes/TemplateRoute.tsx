import { notFound, useLocation, useNavigation, useParams } from '@mikrostack/router'
import { useState } from 'react'
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
import { usePeopleWithColors } from '../domains/people/queries'
import { defaultAttendees } from '../domains/people/selectors'
import { EditorPageView } from '../views/EditorPage'

/**
 * The template editor as a route: `/library/templates/new` and
 * `/library/templates/:id`. Loads the template and the people, hands the form
 * a draft, and writes the template on save. Closes by going back to the list
 * that opened it, or to the list outright from a deep link.
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
  const { accountId, userId } = useAccount()
  const { people, withColors, isPending } = usePeopleWithColors(accountId, userId)
  const close = useClose()
  if (isPending) return <PageLoader />
  return (
    <TemplateSession
      key="new"
      initial={templateDraftForNew(defaultAttendees(people))}
      people={withColors}
      onClose={close}
    />
  )
}

export function EditTemplateRoute() {
  const { id } = useParams('/library/templates/:id')
  const { accountId, userId } = useAccount()
  const { withColors, isPending: peoplePending } = usePeopleWithColors(accountId, userId)
  const { data: templates, isPending } = useTemplates(accountId)
  const close = useClose()
  const template = templates?.find((t) => t.id === id)
  if (!template) {
    if (isPending) return <PageLoader />
    notFound()
  }
  if (peoplePending) return <PageLoader />
  return (
    <TemplateSession
      key={template.id}
      initial={templateDraftFor(template)}
      id={template.id}
      people={withColors}
      onClose={close}
    />
  )
}

/** One editing session: holds the draft, writes on save, composes the page. */
function TemplateSession({
  initial,
  id,
  people,
  onClose,
}: {
  initial: TemplateDraft
  /** The template being edited; absent for a new one. */
  id?: string
  people: Parameters<typeof TemplateForm>[0]['people']
  onClose: () => void
}) {
  const { accountId, userId } = useAccount()
  const events = useEventsWrite()
  const [draft, setDraft] = useState(initial)

  function submit() {
    if (!templateDraftValid(draft)) return
    events.mutate({
      accountId,
      userId,
      change: {
        kind: 'saveTemplate',
        isNew: !id,
        // A new template's id is minted here, so editing it again before the
        // first write lands still names a real row.
        template: { ...templateFromTemplateDraft(draft), id: id ?? uid() },
      },
    })
    onClose()
  }

  return (
    <EditorPageView
      onCancel={onClose}
      onSubmit={submit}
      submitLabel="Save"
      // Nothing to save until the form names a template and differs from
      // what was opened.
      submitDisabled={!templateDraftValid(draft) || !templateDraftChanged(draft, initial)}
    >
      <EditorPageView.Title>{id ? 'Edit template' : 'New template'}</EditorPageView.Title>
      <EditorPageView.Body>
        <TemplateForm draft={draft} onChange={setDraft} people={people} />
      </EditorPageView.Body>
    </EditorPageView>
  )
}
