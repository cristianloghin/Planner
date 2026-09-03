import { Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '../account'
import { useDebouncedValue } from '../assets/hooks/useDebouncedValue'
import s from '../assets/ui/Search.module.css'
import { SearchOverlay } from '../assets/ui/SearchOverlay'
import { cx } from '../assets/utils/cx'
import { isoLabel } from '../assets/utils/dates'
import { useListItemSearch } from '../domains/search/queries'

/**
 * To-do search for the Lists header. Hits the `search_list_items` RPC; picking a
 * result hands its list + item ids back to the Lists view, which selects the list
 * and highlights the row.
 */
export function ListSearch({
  onPick,
}: {
  onPick: (listId: string, itemId: string) => void
}) {
  const { accountId } = useAccount()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // The search fires on a settled term, not on every keystroke.
  const settled = useDebouncedValue(query)
  const {
    data: results = [],
    isFetching,
    error: searchError,
  } = useListItemSearch(accountId, settled)
  const loading = query.trim() !== '' && (query.trim() !== settled.trim() || isFetching)
  const error = searchError ? searchError.message : null

  function close() {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={s.trigger}
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        aria-label="Search to-dos"
      >
        <SearchIcon size={18} />
      </button>

      {open && (
        <SearchOverlay
          placeholder="Search to-dos…"
          query={query}
          onQueryChange={setQuery}
          onClose={close}
          loading={loading}
        >
          {error && <p className={cx(s.hint, s.error)}>{error}</p>}
          {!error && !loading && query.trim() && results.length === 0 && (
            <p className={s.hint}>No matching to-dos.</p>
          )}
          {results.map((r) => (
            <button
              type="button"
              key={r.itemId}
              className={s.row}
              onClick={() => {
                onPick(r.listId, r.itemId)
                close()
              }}
            >
              <span className={cx(s.rowTitle, r.done && s.done)}>{r.title}</span>
              <span className={s.rowMeta}>
                <span>{r.listTitle}</span>
                {r.groupLabel && <span>· {r.groupLabel}</span>}
                {r.dueOn && <span>· due {isoLabel(r.dueOn)}</span>}
                {r.done && <span>· done</span>}
              </span>
            </button>
          ))}
        </SearchOverlay>
      )}
    </>
  )
}
