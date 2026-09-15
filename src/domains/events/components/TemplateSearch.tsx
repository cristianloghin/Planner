import { Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '../../../assets/ui/IconButton'
import s from '../../../assets/ui/Search.module.css'
import { SearchOverlay } from '../../../assets/ui/SearchOverlay'
import { durationLabel } from '../selectors'
import type { EventTemplate } from '../types'

/**
 * Search over the saved templates: a button that opens the shared search
 * overlay, matching titles as you type. The templates are all already loaded,
 * so this filters what it is given rather than asking the server. Picking one
 * hands its id back; the caller opens it.
 */
export function TemplateSearch({
  templates,
  onPick,
}: {
  templates: EventTemplate[]
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const term = query.trim().toLowerCase()
  const hits = term ? templates.filter((t) => t.title.toLowerCase().includes(term)) : []

  function close() {
    setOpen(false)
  }

  return (
    <>
      <IconButton
        label="Search templates"
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
      >
        <SearchIcon size={22} aria-hidden />
      </IconButton>

      {open && (
        <SearchOverlay
          placeholder="Search templates…"
          query={query}
          onQueryChange={setQuery}
          onClose={close}
          loading={false}
        >
          {term && hits.length === 0 && <p className={s.hint}>No matching templates.</p>}
          {hits.map((t) => (
            <button
              type="button"
              key={t.id}
              className={s.row}
              onClick={() => {
                onPick(t.id)
                close()
              }}
            >
              <span className={s.rowTitle}>{t.title || 'Untitled template'}</span>
              <span className={s.rowMeta}>{durationLabel(t)}</span>
            </button>
          ))}
        </SearchOverlay>
      )}
    </>
  )
}
