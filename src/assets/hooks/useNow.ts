import { useEffect, useState } from 'react'

/**
 * The current time, ticking once a minute — so a "now" line moves and today
 * rolls over at midnight, instead of freezing at the last interaction.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(iv)
  }, [])
  return now
}
