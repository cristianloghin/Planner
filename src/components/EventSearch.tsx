import { Search as SearchIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearch } from '../assets/hooks/useSearch'
import s from '../assets/ui/Search.module.css'
import { SearchOverlay } from '../assets/ui/SearchOverlay'
import { cx } from '../assets/utils/cx'
import { isoLabel, toISODate } from '../assets/utils/dates'
import { useAuth } from '../auth'
import { searchEvents } from '../lib/search'

/**
 * Event search in the shared view header (Day / Week / Month). Hits the
 * `search_events` RPC (titles + note and checklist text); picking a result hands
 * its series id back to the view, which navigates to and opens it.
 */
export function EventSearch({ onPick }: { onPick: (seriesId: string) => void }) {
  const { accountId } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const run = useCallback(
    (q: string) => (accountId ? searchEvents(accountId, q) : Promise.resolve([])),
    [accountId],
  )
  const { results, loading, error } = useSearch(query, run)

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
