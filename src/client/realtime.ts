/**
 * Live changes: being told when someone else's edit lands.
 *
 * Only the connection is handled here — opening it, keeping it open, and saying
 * which table changed. What to do about a change is the app's business.
 */
import { supabase } from './supabase'

/** How long to wait before rebuilding a connection that dropped. */
const RETRY_MS = 5_000

/**
 * Listen for changes to any table, until the returned function is called.
 *
 * `onChange` is given the table that changed. Called with nothing, it means the
 * connection came back after being down and changes may have been missed, so
 * everything should be re-read.
 *
 * Two things the caller has to live with. Changes made by this device arrive
 * too, so acting on one must be safe to do repeatedly. And several changes can
 * land at once during someone else's save, so it is worth waiting a beat before
 * reacting rather than reacting to each.
 *
 * There is no account filter because there is no need for one: the database
 * only sends rows the signed-in user is allowed to see.
 */
export function subscribeToChanges(onChange: (table?: string) => void): () => void {
  let disposed = false
  let wasDown = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let channel: ReturnType<typeof supabase.channel>

  const open = () => {
    channel = supabase
      .channel('account-data')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) =>
        onChange(payload.table),
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // A dead connection is silent — edits simply stop arriving and
          // nothing looks wrong. So tear it down and keep trying.
          wasDown = true
          void supabase.removeChannel(channel)
          retryTimer = setTimeout(open, RETRY_MS)
        } else if (status === 'SUBSCRIBED' && wasDown) {
          // Back up. Changes made while it was down were never delivered and
          // never will be, so ask for a full re-read.
          wasDown = false
          onChange()
        }
      })
  }
  open()

  return () => {
    disposed = true
    clearTimeout(retryTimer)
    void supabase.removeChannel(channel)
  }
}
