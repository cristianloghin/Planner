import { useEffect, useState } from 'react'

/** Reactive `matchMedia` — re-renders when the query starts/stops matching. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange() // the query may have changed between render and effect
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
