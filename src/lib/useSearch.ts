import { useEffect, useRef, useState } from 'react'

interface SearchState<T> {
  results: T[]
  loading: boolean
  error: string | null
}

/**
 * Debounced, race-safe search. Re-runs `run` whenever the trimmed `query`
 * changes (after `delay` ms of quiet); a stale in-flight request can never
 * overwrite a newer one, since each effect run owns a `cancelled` flag. An empty
 * query resets to no results without hitting the server.
 *
 * `run` is read through a ref so passing a fresh closure each render doesn't
 * re-trigger the search — only the query (and delay) do.
 */
export function useSearch<T>(
  query: string,
  run: (q: string) => Promise<T[]>,
  delay = 200,
): SearchState<T> {
  const [state, setState] = useState<SearchState<T>>({
    results: [],
    loading: false,
    error: null,
  })

  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setState({ results: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true }))

    const timer = setTimeout(() => {
      runRef
        .current(q)
        .then((results) => {
          if (!cancelled) setState({ results, loading: false, error: null })
        })
        .catch((e) => {
          if (!cancelled)
            setState({
              results: [],
              loading: false,
              error: e instanceof Error ? e.message : 'Search failed',
            })
        })
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, delay])

  return state
}
