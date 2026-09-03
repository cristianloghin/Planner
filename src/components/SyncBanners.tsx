import s from './SyncBanners.module.css'

/**
 * The sync-status surfaces the shell floats over the app: an offline /
 * "changes pending" pill, and a dismissable error banner for a write the
 * server rejected. Pure presentation — the shell reads the state off the
 * query client.
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
