import { Search as SearchIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useAuth } from '../auth'
import { cx } from '../lib/cx'
import { isoLabel } from '../lib/dates'
import { searchListItems } from '../lib/search'
import { useSearch } from '../lib/useSearch'
import s from './Search.module.css'
import { SearchOverlay } from './SearchOverlay'

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
  const { accountId } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const run = useCallback(
    (q: string) => (accountId ? searchListItems(accountId, q) : Promise.resolve([])),
    [accountId],
  )
  const { results, loading, error } = useSearch(query, run)

  function close() {
    setOpen(false)
  }

  return (
    <>
      <button
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
