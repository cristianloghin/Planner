import { Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '../account'
import { useDebouncedValue } from '../assets/hooks/useDebouncedValue'
import s from '../assets/ui/Search.module.css'
import { SearchOverlay } from '../assets/ui/SearchOverlay'
import { cx } from '../assets/utils/cx'
import { isoLabel, toISODate } from '../assets/utils/dates'
import { useEventSearch } from '../domains/search/queries'

/**
 * Event search in the shared view header (Day / Week / Month). Hits the
 * `search_events` RPC (titles + note and checklist text); picking a result hands
 * its series id back to the view, which navigates to and opens it.
 */
export function EventSearch({ onPick }: { onPick: (seriesId: string) => void }) {
  const { accountId } = useAccount()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // The search fires on a settled term, not on every keystroke.
  const settled = useDebouncedValue(query)
  const { data: results = [], isFetching, error: searchError } = useEventSearch(accountId, settled)
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
        aria-label="Search events"
      >
        <SearchIcon size={18} />
      </button>

      {open && (
        <SearchOverlay
          placeholder="Search events…"
          query={query}
          onQueryChange={setQuery}
          onClose={close}
          loading={loading}
        >
          {error && <p className={cx(s.hint, s.error)}>{error}</p>}
          {!error && !loading && query.trim() && results.length === 0 && (
            <p className={s.hint}>No matching events.</p>
          )}
          {results.map((r) => (
            <button
              type="button"
              key={r.seriesId}
              className={s.row}
              onClick={() => {
                onPick(r.seriesId)
                close()
              }}
            >
              <span className={s.rowTitle}>{r.title || 'Untitled'}</span>
              <span className={s.rowMeta}>
                {r.dtstart && <span>{isoLabel(toISODate(new Date(r.dtstart)))}</span>}
                {r.rrule && <span>· repeats</span>}
              </span>
              {r.snippet && <span className={s.snippet}>{r.snippet}</span>}
            </button>
          ))}
        </SearchOverlay>
      )}
    </>
  )
}
