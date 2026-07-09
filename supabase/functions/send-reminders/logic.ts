/**
 * Pure logic for the reminder sender — no Deno APIs, no Supabase client, so
 * the unit suite (vitest, Node) covers it directly:
 * src/lib/reminderSenderLogic.test.ts.
 *
 * It mirrors the client's recurrence semantics (src/lib/recurrence.ts and
 * src/lib/rrule.ts) over RAW database rows, with one twist the client never
 * needs: an explicit IANA timezone. The client computes wall times in the
 * device's zone implicitly; the server runs in UTC and must reconstruct each
 * user's wall clock via Intl. Date arithmetic here is UTC-based on ISO date
 * strings, so the server's own zone can never leak in.
 */

// ---- plain UTC date-string math (mirrors src/lib/dates.ts semantics) --------

const DAY_MS = 86_400_000
const MIN_MS = 60_000

function isoToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

export function addDays(date: string, n: number): string {
  return new Date(isoToUtcMs(date) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `b` to `a` (a - b). */
export function diffDays(a: string, b: string): number {
  return Math.round((isoToUtcMs(a) - isoToUtcMs(b)) / DAY_MS)
}

// ---- RRULE parsing (mirrors src/lib/rrule.ts) --------------------------------

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  /** Inclusive last occurrence date. */
  until?: string
}

const FREQ_MAP: Record<string, Recurrence['freq'] | undefined> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

/**
 * Parse the stored bare RRULE. UNTIL decodes exactly like the client
 * (rruleToRecurrence): the UTC date of the instant rewound 10h, which maps
 * both the current UTC-end-of-day encoding and legacy locally-encoded values
 * onto their intended date. An unmodelled FREQ returns undefined (one-off).
 */
export function parseRRule(rrule: string | null): Recurrence | undefined {
  if (!rrule) return undefined
  const fields = new Map(
    rrule
      .replace(/^RRULE:/, '')
      .split(';')
      .map((part) => {
        const [k, v] = part.split('=')
        return [k?.toUpperCase() ?? '', v ?? ''] as const
      }),
  )
  const freq = FREQ_MAP[fields.get('FREQ') ?? '']
  if (!freq) return undefined
  const interval = Math.max(1, Number(fields.get('INTERVAL') ?? 1) || 1)
  const untilRaw = fields.get('UNTIL')
  let until: string | undefined
  if (untilRaw) {
    const m = untilRaw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
    if (m) {
      const instant = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
      until = new Date(instant - 10 * 3_600_000).toISOString().slice(0, 10)
    }
  }
  return { freq, interval, ...(until ? { until } : {}) }
}

// ---- recurrence expansion (mirrors src/lib/recurrence.ts startsOn) ----------

/** Does an occurrence anchored on `anchor` with `recurrence` start on `date`? */
export function startsOn(
  anchor: string,
  recurrence: Recurrence | undefined,
  date: string,
): boolean {
  const delta = diffDays(date, anchor)
  if (delta < 0) return false
  if (recurrence?.until && diffDays(date, recurrence.until) > 0) return false
  if (delta === 0) return true
  if (!recurrence) return false
  const n = recurrence.interval
  switch (recurrence.freq) {
    case 'daily':
      return delta % n === 0
    case 'weekly':
      return delta % 7 === 0 && (delta / 7) % n === 0
    case 'monthly': {
      const a = new Date(isoToUtcMs(anchor))
      const b = new Date(isoToUtcMs(date))
      // Same day-of-month only (months missing that day simply skip).
      if (a.getUTCDate() !== b.getUTCDate()) return false
      const months =
        (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
      return months % n === 0
    }
  }
}

// ---- timezone bridging -------------------------------------------------------

/** The wall-clock date + minutes-past-midnight of `ms` in `timeZone`. */
export function wallParts(timeZone: string, ms: number): { date: string; minutes: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(ms)) p[part.type] = part.value
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  }
}

/**
 * The instant at which `timeZone`'s wall clock reads `date` + `minutes`.
 * Guess-and-correct via wallParts, iterated twice so a DST transition between
 * the guess and the target still converges. (A nonexistent wall time — the
 * spring-forward gap — lands on the shifted clock like the client would.)
 */
export function wallToInstantMs(timeZone: string, date: string, minutes: number): number {
  const desired = isoToUtcMs(date) + minutes * MIN_MS
  let guess = desired
  for (let i = 0; i < 2; i++) {
    const w = wallParts(timeZone, guess)
    guess += desired - (isoToUtcMs(w.date) + w.minutes * MIN_MS)
  }
  return guess
}

/** hh:mm of `ms` in `timeZone`, for notification bodies. */
export function wallTimeLabel(timeZone: string, ms: number): string {
  const { minutes } = wallParts(timeZone, ms)
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

// ---- the due computation ------------------------------------------------------

/** All-day reminders have no clock time; anchor to this minute of the day
 *  (mirrors src/lib/notifications.ts ALLDAY_REMINDER_MIN). */
export const ALLDAY_REMINDER_MIN = 9 * 60

export interface SenderSeries {
  id: string
  title: string
  all_day: boolean
  dtstart: string // timestamptz ISO
  rrule: string | null
}

export interface SenderReminder {
  id: string
  series_id: string
  user_id: string
  offset_seconds: number
}

export interface SenderOverride {
  series_id: string
  occurrence_start: string // timestamptz ISO — ORIGINAL slot
  rescheduled_to: string | null
  cancelled: boolean
}

export interface DueNotification {
  seriesId: string
  reminderId: string
  userId: string
  /** ORIGINAL-slot identity, for notification_log dedup. */
  occurrenceStart: string
  fireAtMs: number
  title: string
  body: string
  /** Notification collapse key. */
  tag: string
}

export interface DueArgs {
  series: SenderSeries[]
  reminders: SenderReminder[]
  overrides: SenderOverride[]
  timeZone: string
  /** Half-open window (windowStartMs, windowEndMs]. */
  windowStartMs: number
  windowEndMs: number
}

/**
 * Reminders whose fire instant falls in the window, honouring per-occurrence
 * state exactly like the client (src/lib/notifications.ts dueAlerts):
 * cancelled occurrences fire nothing; rescheduled ones fire relative to the
 * overridden start. Occurrence identity — the timestamp written to
 * notification_log — is the ORIGINAL slot, matched to override rows by wall
 * DATE (not exact instant), mirroring the client's day-range matching so a
 * series time edit doesn't detach its overrides.
 */
export function computeDueReminders(args: DueArgs): DueNotification[] {
  const { timeZone, windowStartMs, windowEndMs } = args
  const out: DueNotification[] = []

  const remindersBySeries = new Map<string, SenderReminder[]>()
  for (const r of args.reminders) {
    const arr = remindersBySeries.get(r.series_id) ?? []
    arr.push(r)
    remindersBySeries.set(r.series_id, arr)
  }

  const overridesBySeries = new Map<string, Map<string, SenderOverride>>()
  for (const o of args.overrides) {
    const byDate = overridesBySeries.get(o.series_id) ?? new Map<string, SenderOverride>()
    byDate.set(wallParts(timeZone, Date.parse(o.occurrence_start)).date, o)
    overridesBySeries.set(o.series_id, byDate)
  }

  for (const s of args.series) {
    const reminders = remindersBySeries.get(s.id)
    if (!reminders?.length || !s.dtstart) continue

    const anchor = wallParts(timeZone, Date.parse(s.dtstart))
    const recurrence = parseRRule(s.rrule)
    const maxOffsetMs = Math.max(...reminders.map((r) => r.offset_seconds), 0) * 1000

    // Candidate occurrence dates: reminders fire BEFORE the start, so an
    // occurrence starting up to maxOffset after the window still matters; a
    // day of margin each side absorbs timezone/window straddling.
    const firstDate = addDays(wallParts(timeZone, windowStartMs).date, -1)
    const lastDate = addDays(wallParts(timeZone, windowEndMs + maxOffsetMs).date, 1)

    for (let d = firstDate; diffDays(lastDate, d) >= 0; d = addDays(d, 1)) {
      if (!startsOn(anchor.date, recurrence, d)) continue
      const override = overridesBySeries.get(s.id)?.get(d)
      if (override?.cancelled) continue

      const startMs = override?.rescheduled_to
        ? Date.parse(override.rescheduled_to)
        : wallToInstantMs(timeZone, d, s.all_day ? ALLDAY_REMINDER_MIN : anchor.minutes)

      // Identity = the ORIGINAL slot: the override row's own timestamp when
      // one exists, else the slot the rule produces.
      const occurrenceStart = override
        ? override.occurrence_start
        : new Date(wallToInstantMs(timeZone, d, s.all_day ? 0 : anchor.minutes)).toISOString()

      for (const r of reminders) {
        const fireAtMs = startMs - r.offset_seconds * 1000
        if (fireAtMs <= windowStartMs || fireAtMs > windowEndMs) continue
        const body = s.all_day
          ? 'All-day plan today'
          : r.offset_seconds === 0
            ? `Starting now (${wallTimeLabel(timeZone, startMs)})`
            : `Starts at ${wallTimeLabel(timeZone, startMs)}`
        out.push({
          seriesId: s.id,
          reminderId: r.id,
          userId: r.user_id,
          occurrenceStart,
          fireAtMs,
          title: s.title || 'Planner',
          body,
          tag: `${s.id}:${occurrenceStart}:${r.id}`,
        })
      }
    }
  }

  return out.sort((a, b) => a.fireAtMs - b.fireAtMs)
}
