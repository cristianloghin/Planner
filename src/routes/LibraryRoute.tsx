import { useNavigation } from '@mikrostack/router'
import { Plus } from 'lucide-react'
import { useAccount } from '../account'
import { IconButton } from '../assets/ui/IconButton'
import { TemplateList } from '../domains/events/components/TemplateList'
import { TemplateSearch } from '../domains/events/components/TemplateSearch'
import { useEventsWrite } from '../domains/events/mutations'
import { useTemplates } from '../domains/events/queries'
import { SectionView } from '../views/Section'

/**
 * The Library: the things you author and reuse — templates, and notes. Each
 * draws the section frame itself, with the title switching between the two,
 * because what sits either side of the title is each screen's own: the
 * templates screen has a search and a "new" button, notes has nothing yet.
 */

/** The saved templates: open one to edit it, delete one, or start a new one. */
export function TemplatesRoute() {
  const { navigate } = useNavigation()
  const { accountId, userId } = useAccount()
  const { data: templates = [], isPending } = useTemplates(accountId)
  const events = useEventsWrite()
  const open = (id: string) => navigate('/library/templates/:id', { params: { id } })

  return (
    <SectionView>
      <SectionView.Header>
        <SectionView.Header.Left>
          <TemplateSearch templates={templates} onPick={open} />
        </SectionView.Header.Left>
        <SectionView.Header.Center.Option to="/library/templates">
          Templates
        </SectionView.Header.Center.Option>
        <SectionView.Header.Center.Option to="/library/notes">
          Notes
        </SectionView.Header.Center.Option>
        <SectionView.Header.Right>
          <IconButton label="New template" onClick={() => navigate('/library/templates/new')}>
            <Plus size={22} aria-hidden />
          </IconButton>
        </SectionView.Header.Right>
      </SectionView.Header>
      <SectionView.Body>
        <TemplateList
          templates={templates}
          loading={isPending}
          onOpen={open}
          onDelete={(id) =>
            events.mutate({
              accountId,
              userId,
              change: { kind: 'removeTemplate', id },
            })
          }
        />
      </SectionView.Body>
    </SectionView>
  )
}

/** Notes are not built yet; this holds their place in the switch. */
export function NotesRoute() {
  return (
    <SectionView>
      <SectionView.Header>
        <SectionView.Header.Center.Option to="/library/templates">
          Templates
        </SectionView.Header.Center.Option>
        <SectionView.Header.Center.Option to="/library/notes">
          Notes
        </SectionView.Header.Center.Option>
      </SectionView.Header>
      <SectionView.Body>
        <p>Notes will live here.</p>
      </SectionView.Body>
    </SectionView>
  )
}
