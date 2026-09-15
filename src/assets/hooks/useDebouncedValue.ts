import { useEffect, useState } from 'react'

/** `value` as it stood once it had stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return settled
}
