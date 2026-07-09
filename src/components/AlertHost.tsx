import { useEffect, useMemo, useRef, useState } from 'react'
import { useCompletionsForRange } from '../data/completions'
import { addDays, toISODate } from '../lib/dates'
import { type FiredAlert, dueAlerts } from '../lib/notifications'
import { useApp } from '../state'
import s from './AlertHost.module.css'

const SEEN_KEY = 'planner.alertsSeen'
const CHECK_MS = 30_000
// Cap how far back we look so reopening after a long gap can't flood the screen.
const MAX_LOOKBACK_MS = 6 * 60 * 60 * 1000
const AUTO_DISMISS_MS = 15_000

function loadSeen(): number {
  const n = Number(localStorage.getItem(SEEN_KEY))
  return Number.isFinite(n) && n > 0 ? n : Date.now()
}

/**
 * Watches reminders + event offsets and surfaces ones coming due as banners.
 * Fires only while the app is open (no background/push yet).
 */
export function AlertHost() {
  const { state } = useApp()
  const [active, setActive] = useState<FiredAlert[]>([])
  const seenRef = useRef(loadSeen())

  // Per-occurrence state around now, so cancelled occurrences fire nothing and
  // rescheduled ones fire at their overridden time. The range mirrors
  // dueAlerts' relocation lookaround.
  const today = toISODate(new Date())
  const alertRange = useMemo(() => ({ from: addDays(today, -31), to: addDays(today, 31) }), [today])
  const { completions } = useCompletionsForRange(alertRange.from, alertRange.to)

  useEffect(() => {
    function check() {
      const now = Date.now()
      const from = Math.max(seenRef.current, now - MAX_LOOKBACK_MS)
      const due = dueAlerts(state.events, completions, from, now)
      seenRef.current = now
      localStorage.setItem(SEEN_KEY, String(now))
      if (due.length) {
        setActive((prev) => {
          const seen = new Set(prev.map((a) => a.id))
          return [...prev, ...due.filter((a) => !seen.has(a.id))]
        })
      }
    }
    check()
    const iv = window.setInterval(check, CHECK_MS)
    const onVisible = () => !document.hidden && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.events, completions])

  function dismiss(id: string) {
    setActive((prev) => prev.filter((a) => a.id !== id))
  }

  if (!active.length) return null
  return (
    <div className={s.alertHost}>
      {active.map((a) => (
        <AlertCard key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
      ))}
    </div>
  )
}

function AlertCard({ alert, onDismiss }: { alert: FiredAlert; onDismiss: () => void }) {
  // Arm the auto-dismiss once per card. `onDismiss` is a fresh closure on every
  // parent render (any app dispatch), so depending on it would restart the timer
  // and keep a banner alive indefinitely while the user is active.
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  useEffect(() => {
    const t = window.setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className={s.alertCard} role="status">
      <span className={s.alertIcon}>🔔</span>
      <div className={s.alertText}>
        <strong>{alert.title}</strong>
        {alert.sub && <span>{alert.sub}</span>}
      </div>
      <button type="button" className={s.alertDismiss} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
