import { useCallback, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { useAuth } from "../auth";
import { cx } from "../lib/cx";
import { isoLabel, toISODate } from "../lib/dates";
import { searchEvents } from "../lib/search";
import { useSearch } from "../lib/useSearch";
import s from "./Search.module.css";
import { SearchOverlay } from "./SearchOverlay";

/**
 * Event search for the Week header. Hits the `search_events` RPC (titles + note
 * and checklist text); picking a result hands its series id back to the calendar,
 * which navigates to and opens it.
 */
export function EventSearch({ onPick }: { onPick: (seriesId: string) => void }) {
  const { accountId } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const run = useCallback(
    (q: string) => (accountId ? searchEvents(accountId, q) : Promise.resolve([])),
    [accountId],
  );
  const { results, loading, error } = useSearch(query, run);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        className={s.trigger}
        onClick={() => {
          setQuery("");
          setOpen(true);
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
              key={r.seriesId}
              className={s.row}
              onClick={() => {
                onPick(r.seriesId);
                close();
              }}
            >
              <span className={s.rowTitle}>{r.title || "Untitled"}</span>
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
  );
}
