import { useNavigation } from '@mikrostack/router'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useAccount } from '../account'
import { IconButton } from '../assets/ui/IconButton'
import { TemplateList } from '../domains/events/components/TemplateList'
import { TemplateSearch } from '../domains/events/components/TemplateSearch'
import { useEventsWrite } from '../domains/events/mutations'
import { useTemplates } from '../domains/events/queries'
import { NoteList } from '../domains/notes/components/NoteList'
import { useNotesWrite } from '../domains/notes/mutations'
import { useNotes } from '../domains/notes/queries'
import { standaloneByAuthorFor } from '../domains/notes/selectors'
import { SectionView } from '../views/Section'

/**
 * The Library: the things you author and reuse — templates, and notes. Each
 * draws the section frame itself, with the title switching between the two,
 * because what sits either side of the title is each screen's own: the
 * templates screen has a search and a "new" button, notes just the button.
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
          <IconButton
            label="New template"
            onClick={() => navigate('/library/templates/new')}
            icon={Plus}
          />
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

/** The standalone notes: this user's and everyone else's, with a way to open, delete and start one. */
export function NotesRoute() {
  const { navigate } = useNavigation()
  const { accountId, userId } = useAccount()
  const select = useMemo(() => standaloneByAuthorFor(userId), [userId])
  const { data: notes = EMPTY, isPending } = useNotes(accountId, select)
  const write = useNotesWrite()

  return (
    <SectionView>
      <SectionView.Header>
        <SectionView.Header.Center.Option to="/library/templates">
          Templates
        </SectionView.Header.Center.Option>
        <SectionView.Header.Center.Option to="/library/notes">
          Notes
        </SectionView.Header.Center.Option>
        <SectionView.Header.Right>
          <IconButton label="New note" onClick={() => navigate('/library/notes/new')} icon={Plus} />
        </SectionView.Header.Right>
      </SectionView.Header>
      <SectionView.Body>
        <NoteList
          mine={notes.mine}
          theirs={notes.theirs}
          loading={isPending}
          onOpen={(id) => navigate('/library/notes/:id', { params: { id } })}
          onDelete={(id) => write.mutate({ accountId, userId, change: { kind: 'removeNote', id } })}
        />
      </SectionView.Body>
    </SectionView>
  )
}

const EMPTY = { mine: [], theirs: [] }
