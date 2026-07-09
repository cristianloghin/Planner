import s from './SyncBanners.module.css'

/**
 * The sync-status surfaces AppProvider floats over the app: an offline /
 * "changes pending" pill, and a dismissable error banner for a write the
 * server rejected. Pure presentation — all state lives in the provider.
 */
export function SyncBanners({
  offline,
  pendingCount,
  pendingStalled,
  syncError,
  onDismissError,
}: {
  offline: boolean
  pendingCount: number
  /** True once a nonzero queue has visibly stalled (so the pill doesn't flash
   *  on every quick online write). */
  pendingStalled: boolean
  syncError: string | null
  onDismissError: () => void
}) {
  const showOffline = !syncError && (offline || (pendingStalled && pendingCount > 0))
  const changes = `${pendingCount} change${pendingCount === 1 ? '' : 's'}`
  const offlineText = offline
    ? pendingCount > 0
      ? `Offline — ${changes} will sync when you're back online`
      : 'Offline — showing saved data'
    : `Syncing ${changes}…`

  return (
    <>
      {showOffline && (
        <div role="status" className={s.banner}>
          {offlineText}
        </div>
      )}
      {syncError && (
        <div role="alert" className={`${s.banner} ${s.error}`}>
          {syncError}
          <button type="button" className={s.dismiss} onClick={onDismissError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </>
  )
}

/** First launch with no snapshot and no network: a retry beats an eternal spinner. */
export function LoadFailedScreen({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div className={s.loadFailed}>
      <p>Couldn&apos;t load your planner{offline ? ' — you appear to be offline.' : '.'}</p>
      <button type="button" className={s.retry} onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
