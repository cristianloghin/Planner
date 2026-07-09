import { useRegisterSW } from 'virtual:pwa-register/react'
import s from './UpdatePrompt.module.css'

// Long-open standalone PWA windows otherwise only check for a new service worker
// on launch/navigation; poll so a fresh deploy is noticed within the half-hour.
const UPDATE_CHECK_MS = 30 * 60 * 1000

// `onRegisteredSW` has no cleanup hook, so a remount (StrictMode double-mounts
// in dev) would stack a second interval + listener. Install them once.
let checksInstalled = false

/**
 * "Update available" toast. We register in `prompt` mode (see vite.config.ts), so
 * a new deploy never reloads on its own — it surfaces here and the user applies
 * it with a tap, which keeps an open EventEditor's unsaved draft safe. Also drives
 * a periodic + on-focus update check so a window left open still notices deploys.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration || checksInstalled) return
      checksInstalled = true
      const check = () => {
        if (!document.hidden) void registration.update()
      }
      window.setInterval(check, UPDATE_CHECK_MS)
      // Catch a deploy that happened while the window was backgrounded.
      document.addEventListener('visibilitychange', check)
    },
  })

  if (!needRefresh) return null

  return (
    <div className={s.host} role="status" aria-live="polite">
      <div className={s.card}>
        <div className={s.text}>
          <strong>Update available</strong>
          <span>A new version of Planner is ready.</span>
        </div>
        <button type="button" className={s.reload} onClick={() => void updateServiceWorker()}>
          Reload
        </button>
        <button type="button" className={s.later} onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  )
}
