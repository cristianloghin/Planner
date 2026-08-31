/**
 * Watching for reminders coming due while the app is open.
 *
 * Owns the whole business of *when to look*: a check every half minute, another
 * whenever the app is brought back to the front, and a note in local storage of
 * how far it has already looked so a reminder is never shown twice.
 *
 * Fed the events and their per-day state, so it never reads anything itself —
 * which also means a cancelled day fires nothing and a moved one fires at its
 * new time, without this having to know why.
 */
import { useEffect, useState } from 'react'
import type { CalendarEvent } from '../../domains/events/types'
import type { CompletionsMap } from '../../domains/occurrences/types'
import { type FiredAlert, dueAlerts } from './alerts'

/** How far it has already looked. Survives a reload, so nothing repeats. */
const SEEN_KEY = 'planner.alertsSeen'
const CHECK_MS = 30_000
/**
 * Cap on how far back a single check reaches. Coming back after a week away
 * should not empty a week of reminders onto the screen at once.
 */
const MAX_LOOKBACK_MS = 6 * 60 * 60 * 1000

function loadSeen(): number {
  try {
    const n = Number(localStorage.getItem(SEEN_KEY))
    return Number.isFinite(n) && n > 0 ? n : Date.now()
  } catch {
    // Private browsing, or storage turned off. Start from now.
    return Date.now()
  }
}

function saveSeen(at: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at))
  } catch {
    // Nothing to do — the worst case is a reminder shown twice.
  }
}

/**
 * The reminders that have come due and not yet been dismissed.
 *
 * Returns them oldest first, with a way to dismiss one. Showing them is the
 * caller's business.
 */
export function useDueAlerts(
  events: CalendarEvent[],
  completions: CompletionsMap,
): { active: FiredAlert[]; dismiss: (id: string) => void } {
  const [active, setActive] = useState<FiredAlert[]>([])

  useEffect(() => {
    // Held here rather than in a ref: the mark only ever moves forward, and the
    // effect that moves it is the only thing that reads it.
    let seen = loadSeen()

    function check() {
      const now = Date.now()
      const from = Math.max(seen, now - MAX_LOOKBACK_MS)
      const due = dueAlerts(events, completions, from, now)
      seen = now
      saveSeen(now)
      if (!due.length) return
      setActive((prev) => {
        // One that is already on screen must not be added again.
        const showing = new Set(prev.map((a) => a.id))
        return [...prev, ...due.filter((a) => !showing.has(a.id))]
      })
    }

    check()
    const timer = window.setInterval(check, CHECK_MS)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [events, completions])

  return {
    active,
    dismiss: (id: string) => setActive((prev) => prev.filter((a) => a.id !== id)),
  }
}
