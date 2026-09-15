/**
 * Turning a stream of "this table changed" into a decision about what to
 * refresh.
 *
 * A partner's save touches several tables in the same second, so acting on each
 * change would refresh the same thing five times. This collects them for a beat
 * and reports once.
 *
 * Both ends are fed in. Where the changes come from is the client's business,
 * and *what to refresh* is the app's — which tables map to which cached queries
 * is not something this can know without reaching into a domain.
 */

/** What happened since the last report. */
export interface RealtimeChange {
  /**
   * The tables that changed. Empty when nothing specific was named, which is
   * what a reconnection looks like.
   */
  tables: Set<string>
  /**
   * The connection dropped and came back, so changes went unseen and cannot be
   * asked for. Everything should be re-read, whatever `tables` says.
   */
  missedSome: boolean
}

export interface RealtimeWiring {
  /** Opens the connection. Returns a function that closes it. */
  subscribe: (onChange: (table?: string) => void) => () => void
  /** Called once per quiet moment, with everything seen since the last one. */
  onChanged: (change: RealtimeChange) => void
  /**
   * How long to wait for things to go quiet. The default matches what the app
   * settled on: long enough to fold one save's tables together, short enough
   * that a partner's change still feels immediate.
   */
  quietMs?: number
}

const DEFAULT_QUIET_MS = 200

/**
 * Watch for changes until the returned function is called.
 *
 * Changes made by this device arrive too, so whatever `onChanged` does has to
 * be safe to do repeatedly.
 */
export function startRealtime({
  subscribe,
  onChanged,
  quietMs = DEFAULT_QUIET_MS,
}: RealtimeWiring): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let tables = new Set<string>()
  let missedSome = false
  let stopped = false

  const report = () => {
    timer = undefined
    if (stopped) return
    const change = { tables, missedSome }
    tables = new Set()
    missedSome = false
    onChanged(change)
  }

  const stop = subscribe((table) => {
    if (stopped) return
    if (table === undefined) missedSome = true
    else tables.add(table)
    // Restart the wait on every change, so a burst reports once at its end
    // rather than once at its start and again for the tail.
    clearTimeout(timer)
    timer = setTimeout(report, quietMs)
  })

  return () => {
    stopped = true
    clearTimeout(timer)
    stop()
  }
}
