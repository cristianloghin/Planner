import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import { active } from '../lib/sync'
import { dueAlerts, type FiredAlert } from '../lib/notifications'

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
  const [banners, setBanners] = useState<FiredAlert[]>([])
  const seenRef = useRef(loadSeen())

  useEffect(() => {
    function check() {
      const now = Date.now()
      const from = Math.max(seenRef.current, now - MAX_LOOKBACK_MS)
      const due = dueAlerts(active(state.events), active(state.reminders), from, now)
      seenRef.current = now
      localStorage.setItem(SEEN_KEY, String(now))
      if (due.length) {
        setBanners((prev) => {
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
  }, [state.events, state.reminders])

  function dismiss(id: string) {
    setBanners((prev) => prev.filter((a) => a.id !== id))
  }

  if (!banners.length) return null
  return (
    <div className="alert-host">
      {banners.map((a) => (
        <AlertCard key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
      ))}
    </div>
  )
}

function AlertCard({ alert, onDismiss }: { alert: FiredAlert; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="alert-card" role="status">
      <span className="alert-icon">🔔</span>
      <div className="alert-text">
        <strong>{alert.title}</strong>
        {alert.sub && <span>{alert.sub}</span>}
      </div>
      <button className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
