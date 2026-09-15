import { useRef } from 'react'

/**
 * A ref that always holds the latest `value`. For callbacks that bind once
 * (native listeners, timers, one-shot effects) but must read the current
 * state/props when they eventually fire — the alternative would be tearing
 * down and re-subscribing on every change, or firing from a stale closure.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}
