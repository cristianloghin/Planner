import { checklists, notes as noteAttachments } from '../lib/attachments'
import type { Json } from '../lib/database.types'
import { toDateTimeLocal, toISODate } from '../lib/dates'
import { uid } from '../lib/id'
import { isColorKey } from '../lib/palette'
import { recurrenceToRRule, rruleToRecurrence, truncatedRRule } from '../lib/rrule'
import { supabase } from '../lib/supabase'
import type {
  AppState,
  Attachment,
  CalendarEvent,
  ChecklistEntry,
  EventTemplate,
  ListItem,
  OccurrenceDependency,
  OccurrenceStatusCode,
  Person,
  PersonId,
  Preferences,
  TodoList,
} from '../types'
import type { Action } from './actions'
import type { ScheduleStore } from './store'
import { defaultState } from './store'

const MINS_PER_DAY = 24 * 60

// Legacy device-local Lists store (pre-migration 0009). Read once to migrate any
// existing items into the backend, then marked imported so it never runs again.
const LEGACY_LISTS_KEY = 'planner.lists.v1'
const LEGACY_LISTS_IMPORTED_KEY = 'planner.lists.v1.imported'

// ---- Phase-1 <-> Postgres conversions ------------------------------------

/** Phase-1 start string -> timestamptz (UTC ISO). Local naive time in, UTC out. */
function startToTs(start: string, allDay: boolean): string {
  const d = allDay ? new Date(start + 'T00:00:00') : new Date(start)
  return d.toISOString()
}

/** timestamptz -> Phase-1 start string ('yyyy-mm-dd' all-day, else 'yyyy-mm-ddThh:mm'). */
function tsToStart(ts: string, allDay: boolean): string {
  const d = new Date(ts)
  return allDay ? toISODate(d) : toDateTimeLocal(d)
}

/** Phase-1 duration (minutes timed / whole days all-day) -> Postgres interval literal. */
function durationToInterval(duration: number, allDay: boolean): string {
  return allDay ? `${Math.max(1, duration)} days` : `${Math.max(0, duration)} minutes`
}

/** Parse a Postgres or ISO-8601 interval string to total minutes. */
function intervalToMinutes(iv: string | null): number {
  if (!iv) return 0
  const iso = iv.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (iso) {
    const [, d, h, m] = iso
    return Number(d || 0) * MINS_PER_DAY + Number(h || 0) * 60 + Number(m || 0)
  }
  let min = 0
  const dayM = iv.match(/(\d+)\s+days?/)
  if (dayM) min += Number(dayM[1]) * MINS_PER_DAY
  // Anchor at the end so a 3+ digit hour count ("100:00:00") parses whole.
  const timeM = iv.match(/(\d+):(\d{2}):(\d{2})\s*$/)
  if (timeM) min += Number(timeM[1]) * 60 + Number(timeM[2])
  return min
}

function intervalToDuration(iv: string | null, allDay: boolean): number {
  const min = intervalToMinutes(iv)
  return allDay ? Math.max(1, Math.round(min / MINS_PER_DAY)) : min
}

/** The original-slot timestamptz of `event`'s occurrence starting on ISO `date`. */
function occurrenceTs(event: CalendarEvent, date: string): string {
  if (event.allDay) return new Date(date + 'T00:00:00').toISOString()
  const timeOfDay = event.start.slice(11) || '00:00'
  return new Date(`${date}T${timeOfDay}`).toISOString()
}

/** completions key from a stored occurrence_start. */
function tsToDateKey(ts: string): string {
  return toISODate(new Date(ts))
}

/**
 * UTC timestamp bounds of local ISO `date` — the half-open [from, to) window an
 * occurrence-row `occurrence_start` for that date falls in. Occurrence rows are
 * MATCHED by this window rather than by an exact timestamp: the stored value
 * carries the time-of-day the series had when the row was written, so after the
 * series' start time is edited an exact match would silently miss every
 * existing row (orphaning ticks, statuses and overrides), while the app itself
 * only ever keys occurrence state by date (`tsToDateKey`).
 */
function dayRange(date: string): { from: string; to: string } {
  const d = new Date(date + 'T00:00:00')
  const from = d.toISOString()
  d.setDate(d.getDate() + 1)
  return { from, to: d.toISOString() }
}

/**
 * Drain a query in pages: PostgREST silently caps a response at 1000 rows, so
 * any unpaginated table scan starts dropping data once an account outgrows the
 * cap. `build` must apply a stable `.order(...)` so pages tile correctly.
 */
const PAGE = 1000
async function fetchAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

// ---- Row shapes (kept local; the generated types don't model embeds well) --

interface SeriesRow {
  id: string
  title: string
  all_day: boolean
  dtstart: string | null
  duration: string | null
  rrule: string | null
  color_key: string | null
  event_person: { person_id: string }[]
  checklist_item: {
    id: string
    label: string
    group_label: string | null
    sort_order: number
    occurrence_start: string | null
  }[]
  note: { id: string; body: string }[]
  reminder: { id: string; offset_seconds: number }[]
}

/** The roster + attachments shared by a real event and a template, for the sync
 *  helpers that reconcile those child rows (they never touch timing). */
type SeriesAttachments = { id: string; attendees: PersonId[]; attachments: Attachment[] }

export class SupabaseStore implements ScheduleStore {
  constructor(
    private readonly accountId: string,
    private readonly userId: string,
  ) {}

  // ---- READ --------------------------------------------------------------

  async load(): Promise<AppState> {
    const base = defaultState()

    // Not loaded here: templates and per-occurrence state (completions) are
    // owned by TanStack Query (src/data/templates.ts, src/data/completions.ts)
    // and fetched per window — completions grow with every tick ever made, so
    // hydrating them whole would scale startup with account age. The mappings
    // still live in this class and are reused via the public methods.
    const [people, events, dependencies, preferences, lists, listLinks] = await Promise.all([
      this.loadPeople(),
      this.loadEvents(),
      this.loadDependencies(),
      this.loadPreferences(),
      this.loadLists(),
      this.loadListLinks(),
    ])

    return {
      ...base,
      people,
      events,
      dependencies,
      preferences,
      lists,
      listLinks,
    }
  }

  // ---- TEMPLATES (owned by TanStack Query, served from the same mapping) ----
  // Public wrappers so the query layer reuses this store's row conversions
  // instead of duplicating the event_series shape. The first slice migrated off
  // the reducer; events and the rest still flow through load()/apply().

  listTemplates(): Promise<EventTemplate[]> {
    return this.loadTemplates()
  }

  saveTemplate(t: EventTemplate): Promise<void> {
    return this.writeTemplate(t)
  }

  async deleteTemplate(id: string): Promise<void> {
    // Cascade drops the template's roster/attachments; `template_id` on any
    // events made from it is `on delete set null`, so they're untouched.
    const { error } = await supabase.from('event_series').delete().eq('id', id)
    if (error) throw error
  }

  /**
   * This user's preference document for this account, defaulted if none yet.
   * Preferences are non-critical: if the read fails (e.g. migration 0007 not yet
   * applied) we fall back to defaults rather than breaking the whole hydration.
   */
  private async loadPreferences(): Promise<Preferences> {
    const empty: Preferences = { personColors: {} }
    const { data, error } = await supabase
      .from('user_preference')
      .select('prefs')
      .eq('account_id', this.accountId)
      .eq('user_id', this.userId)
      .maybeSingle()
    if (error) {
      console.warn('Could not load preferences; using defaults.', error)
      return empty
    }
    const prefs = (data?.prefs ?? {}) as Partial<Preferences>
    // Keep only valid palette keys; legacy hex overrides are dropped so the
    // person falls back to their (migrated) shared color.
    const personColors: Preferences['personColors'] = {}
    for (const [id, key] of Object.entries(prefs.personColors ?? {})) {
      if (isColorKey(key)) personColors[id] = key
    }
    return { ...empty, ...prefs, personColors }
  }

  private async loadPeople(): Promise<Record<string, Person>> {
    const { data, error } = await supabase
      .from('person')
      .select('id, name, color, kind, sort_order')
      .eq('account_id', this.accountId)
      .order('sort_order')
    if (error) throw error
    const out: Record<string, Person> = {}
    for (const p of data ?? []) {
      out[p.id] = {
        id: p.id,
        name: p.name,
        color: p.color,
        kind: p.kind === 'child' ? 'child' : 'adult',
        sortOrder: p.sort_order,
      }
    }
    return out
  }

  private async loadEvents(): Promise<CalendarEvent[]> {
    const data = await fetchAll((from, to) =>
      supabase
        .from('event_series')
        // FK-column hints (table!fk_col) disambiguate the embeds: PostgREST sees
        // more than one relationship between event_series and these children
        // (e.g. checklist_item also links many-to-many via occurrence_item_removed).
        .select(
          `id, title, all_day, dtstart, duration, rrule, color_key,
         event_person!series_id ( person_id ),
         checklist_item!owner_series_id ( id, label, group_label, sort_order, occurrence_start ),
         note!owner_series_id ( id, body ),
         reminder!series_id ( id, offset_seconds )`,
        )
        .eq('account_id', this.accountId)
        .eq('is_template', false)
        .order('id')
        .range(from, to),
    )
    const rows = data as unknown as SeriesRow[]
    return rows.map((r) => {
      const allDay = r.all_day
      return {
        id: r.id,
        title: r.title,
        allDay,
        start: r.dtstart ? tsToStart(r.dtstart, allDay) : toISODate(new Date()),
        duration: intervalToDuration(r.duration, allDay),
        recurrence: rruleToRecurrence(r.rrule),
        attendees: r.event_person.map((ep) => ep.person_id),
        colorKey: isColorKey(r.color_key) ? r.color_key : undefined,
        attachments: rebuildAttachments(r),
      }
    })
  }

  /**
   * Templates (`is_template = true`): the same series shell as an event but with
   * no `dtstart`/`rrule`, so we map only title / all-day / duration / roster /
   * attachments. Same embed hints as {@link loadEvents}.
   */
  private async loadTemplates(): Promise<EventTemplate[]> {
    const { data, error } = await supabase
      .from('event_series')
      .select(
        `id, title, all_day, dtstart, duration, rrule,
         event_person!series_id ( person_id ),
         checklist_item!owner_series_id ( id, label, group_label, sort_order, occurrence_start ),
         note!owner_series_id ( id, body ),
         reminder!series_id ( id, offset_seconds )`,
      )
      .eq('account_id', this.accountId)
      .eq('is_template', true)
    if (error) throw error

    const rows = (data ?? []) as unknown as SeriesRow[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      allDay: r.all_day,
      duration: intervalToDuration(r.duration, r.all_day),
      attendees: r.event_person.map((ep) => ep.person_id),
      attachments: rebuildAttachments(r),
    }))
  }

  /**
   * Prerequisite edges, keyed by the dependent occurrence (`${seriesId}:${date}`)
   * to match `AppState.dependencies`. Each `occurrence_dependency` row carries
   * timestamptz slots on both ends; we key/store them as occurrence dates.
   */
  private async loadDependencies(): Promise<Record<string, OccurrenceDependency[]>> {
    // Scope to this account via the dependent series (RLS alone would also let a
    // user in several accounts pull the others' rows) and page past the row cap.
    const data = await fetchAll((from, to) =>
      supabase
        .from('occurrence_dependency')
        .select(
          'dependent_series, dependent_occurrence, prerequisite_series, prerequisite_occurrence, required_status, event_series!dependent_series!inner()',
        )
        .eq('event_series.account_id', this.accountId)
        .order('dependent_series')
        .order('dependent_occurrence')
        .order('prerequisite_series')
        .order('prerequisite_occurrence')
        .range(from, to),
    )
    const out: Record<string, OccurrenceDependency[]> = {}
    for (const row of data ?? []) {
      const k = `${row.dependent_series}:${tsToDateKey(row.dependent_occurrence)}`
      ;(out[k] ??= []).push({
        prerequisiteSeriesId: row.prerequisite_series,
        prerequisiteDate: tsToDateKey(row.prerequisite_occurrence),
        requiredStatus: row.required_status as OccurrenceDependency['requiredStatus'],
      })
    }
    return out
  }

  /**
   * Per-occurrence state whose occurrence date falls in [fromDate, toDate)
   * (local ISO dates), as a `CompletionsMap`. Owned by the TanStack Query layer
   * (src/data/completions.ts), which fetches per month window — these tables
   * grow with every tick ever made, so they are never loaded whole. Rows whose
   * `rescheduled_to` lands in the window are included too, so an occurrence
   * moved INTO the window from a distant origin still renders.
   */
  async loadCompletionsRange(
    fromDate: string,
    toDate: string,
  ): Promise<Record<string, import('../types').OccurrenceState>> {
    const completions: Record<string, import('../types').OccurrenceState> = {}
    const key = (seriesId: string, ts: string) => `${seriesId}:${tsToDateKey(ts)}`
    const fromTs = dayRange(fromDate).from
    const toTs = dayRange(toDate).from

    const [occData, itemData] = await Promise.all([
      // Embed the parent's all_day so reschedule columns map back into the same
      // unit convention as CalendarEvent (timed = minutes, all-day = days). The
      // inner join also scopes the scan to this account, and both queries page
      // past the 1000-row response cap.
      fetchAll((from, to) =>
        supabase
          .from('event_occurrence')
          .select(
            'series_id, occurrence_start, status, rescheduled_to, rescheduled_duration, cancelled, event_series!inner(all_day, account_id)',
          )
          .eq('event_series.account_id', this.accountId)
          .or(
            `and(occurrence_start.gte."${fromTs}",occurrence_start.lt."${toTs}"),and(rescheduled_to.gte."${fromTs}",rescheduled_to.lt."${toTs}")`,
          )
          .order('series_id')
          .order('occurrence_start')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from('occurrence_item_state')
          .select('series_id, occurrence_start, item_id, status, event_series!inner()')
          .eq('event_series.account_id', this.accountId)
          .gte('occurrence_start', fromTs)
          .lt('occurrence_start', toTs)
          .order('series_id')
          .order('occurrence_start')
          .order('item_id')
          .range(from, to),
      ),
    ])

    for (const o of occData) {
      // PostgREST returns the to-one parent embed as an object.
      const allDay = (o.event_series as { all_day: boolean } | null)?.all_day ?? false
      const entry: import('../types').OccurrenceState = {
        ...completions[key(o.series_id, o.occurrence_start)],
      }
      if (o.status) entry.status = o.status as OccurrenceStatusCode
      if (o.cancelled) entry.cancelled = true
      if (o.rescheduled_to) entry.start = tsToStart(o.rescheduled_to, allDay)
      if (o.rescheduled_duration)
        entry.duration = intervalToDuration(o.rescheduled_duration, allDay)
      // Skip rows that carry no app-visible state (e.g. a cleared override).
      if (entry.status || entry.cancelled || entry.start != null || entry.duration != null) {
        completions[key(o.series_id, o.occurrence_start)] = entry
      }
    }
    for (const it of itemData) {
      const k = key(it.series_id, it.occurrence_start)
      const checked = { ...(completions[k]?.checked ?? {}) }
      checked[it.item_id] = it.status === 'done'
      completions[k] = { ...completions[k], checked }
    }
    return completions
  }

  /**
   * Named lists with their items, ordered + grouped like checklists (sort_order
   * ascending). One-time migrates any pre-0009 device-local items first.
   */
  private async loadLists(): Promise<TodoList[]> {
    await this.importLegacyLists()

    const [lists, items] = await Promise.all([
      supabase
        .from('list')
        .select('id, title, sort_order')
        .eq('account_id', this.accountId)
        .order('sort_order'),
      // Scoped to the account through the parent list, and paged: an unfiltered
      // scan is capped at 1000 rows and would silently drop items.
      fetchAll((from, to) =>
        supabase
          .from('list_item')
          .select(
            'id, list_id, group_label, title, done, person_id, due_on, sort_order, created_at, list!inner()',
          )
          .eq('list.account_id', this.accountId)
          .order('sort_order')
          .order('id')
          .range(from, to),
      ),
    ])
    if (lists.error) throw lists.error

    const byList = new Map<string, ListItem[]>()
    for (const it of items) {
      const arr = byList.get(it.list_id) ?? []
      arr.push({
        id: it.id,
        title: it.title,
        done: it.done,
        personId: it.person_id,
        groupLabel: it.group_label,
        dueOn: it.due_on,
        sortOrder: it.sort_order,
        createdAt: Date.parse(it.created_at),
      })
      byList.set(it.list_id, arr)
    }

    return (lists.data ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      sortOrder: l.sort_order,
      // The query already orders by sort_order; sort again defensively in case a
      // list's items arrive interleaved across the result set.
      items: (byList.get(l.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  }

  /**
   * Migrate pre-0009 `planner.lists.v1` items (a flat, device-local array) into a
   * single backend list, once. Guarded by a localStorage flag AND by the account
   * already having lists, so it can't double-import or fight a partner's data.
   */
  private async importLegacyLists(): Promise<void> {
    let legacy: { title?: string; done?: boolean; personId?: string | null }[]
    try {
      if (localStorage.getItem(LEGACY_LISTS_IMPORTED_KEY)) return
      const raw = localStorage.getItem(LEGACY_LISTS_KEY)
      legacy = raw ? JSON.parse(raw) : []
    } catch {
      return
    }
    if (!Array.isArray(legacy) || legacy.length === 0) {
      try {
        localStorage.setItem(LEGACY_LISTS_IMPORTED_KEY, '1')
      } catch {
        /* ignore */
      }
      return
    }

    // Only import into an empty account, so we never duplicate on a second device.
    const existing = await supabase
      .from('list')
      .select('id')
      .eq('account_id', this.accountId)
      .limit(1)
    if (existing.error) throw existing.error
    if ((existing.data ?? []).length > 0) {
      try {
        localStorage.setItem(LEGACY_LISTS_IMPORTED_KEY, '1')
      } catch {
        /* ignore */
      }
      return
    }

    const listId = uid()
    const insList = await supabase
      .from('list')
      .insert({ id: listId, account_id: this.accountId, title: 'To-do', sort_order: 0 })
    if (insList.error) throw insList.error

    const rows = legacy.map((it, i) => ({
      id: uid(),
      list_id: listId,
      title: String(it.title ?? ''),
      done: Boolean(it.done),
      person_id: it.personId ?? null,
      sort_order: i,
    }))
    const insItems = await supabase.from('list_item').insert(rows)
    if (insItems.error) throw insItems.error

    try {
      localStorage.setItem(LEGACY_LISTS_IMPORTED_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  /**
   * To-do→occurrence links (`list_item_event_link`), keyed by the occurrence
   * (`${series_id}:${date}`) like `AppState.dependencies`. `occurrence_start` is
   * the original slot; we store it as the occurrence date.
   */
  private async loadListLinks(): Promise<Record<string, string[]>> {
    const data = await fetchAll((from, to) =>
      supabase
        .from('list_item_event_link')
        .select('list_item_id, series_id, occurrence_start, event_series!inner()')
        .eq('event_series.account_id', this.accountId)
        .order('list_item_id')
        .order('series_id')
        .order('occurrence_start')
        .range(from, to),
    )
    const out: Record<string, string[]> = {}
    for (const row of data ?? []) {
      const k = `${row.series_id}:${tsToDateKey(row.occurrence_start)}`
      ;(out[k] ??= []).push(row.list_item_id)
    }
    return out
  }

  // ---- SUBSCRIBE ---------------------------------------------------------

  /**
   * Fire `onChange` whenever any calendar table changes (including our own
   * writes — the caller debounces and reloads idempotently). RLS scopes the
   * stream to this user's account, so no per-account filter is needed. Returns
   * an unsubscribe fn.
   */
  subscribe(onChange: (table?: string) => void): () => void {
    let disposed = false
    let hadError = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<typeof supabase.channel>

    const open = () => {
      channel = supabase
        .channel('account-data')
        // The changed table lets the caller route Query-owned slices (per-
        // occurrence state) to targeted invalidation instead of a full reload.
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) =>
          onChange(payload.table),
        )
        .subscribe((status) => {
          if (disposed) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // A dead channel means sync silently stops; tear down and retry.
            hadError = true
            void supabase.removeChannel(channel)
            retryTimer = setTimeout(open, 5_000)
          } else if (status === 'SUBSCRIBED' && hadError) {
            // Recovered — reload once to pick up anything missed while down.
            hadError = false
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

  // ---- WRITE -------------------------------------------------------------

  async apply(action: Action, next: AppState): Promise<void> {
    switch (action.type) {
      case 'addEvent': {
        // The queued action carries the minted id (backfilled by the
        // dispatcher), so an offline replay against a later state still finds
        // its own event; fall back to the just-appended one.
        const ev = action.id
          ? next.events.find((e) => e.id === action.id)
          : next.events[next.events.length - 1]
        if (ev) await this.writeEvent(ev, { isNew: true, templateId: action.templateId })
        return
      }
      case 'updateEvent':
        await this.writeEvent(action.event, { isNew: false })
        return
      case 'removeEvent': {
        const { error } = await supabase.from('event_series').delete().eq('id', action.id)
        if (error) throw error
        return
      }
      case 'splitSeries': {
        // The reducer already capped the old series and appended an optimistic
        // clone; here we do the authoritative split. `next` still holds the old
        // series' timing (only `recurrence.until` changed), so occurrenceTs and
        // truncatedRRule read the right anchor/rule.
        const old = next.events.find((e) => e.id === action.eventId)
        if (!old || !old.recurrence) return
        const cutover = occurrenceTs(old, action.fromDate)
        const { data: newId, error: rpcErr } = await supabase.rpc('split_series', {
          p_series: action.eventId,
          p_cutover: cutover,
          p_truncated_rrule: truncatedRRule(old.recurrence, action.fromDate),
        })
        if (rpcErr) throw rpcErr
        // Apply the user's edits to the cloned series' own row + roster. Its
        // checklist/notes/reminders were copied by the RPC (fresh ids, with
        // future ticks migrated), so we deliberately don't re-sync those.
        const e = action.event
        const up = await supabase
          .from('event_series')
          .update({
            title: e.title,
            all_day: e.allDay,
            dtstart: startToTs(e.start, e.allDay),
            duration: durationToInterval(e.duration, e.allDay),
            rrule: recurrenceToRRule(e.recurrence),
            color_key: e.colorKey ?? null,
          })
          .eq('id', newId as string)
        if (up.error) throw up.error
        await this.syncAttendees({
          id: newId as string,
          attendees: e.attendees,
          attachments: e.attachments,
        })
        // A full reload (driven by the realtime change + edit-guard flush) then
        // replaces the optimistic clone with the real, migrated shape.
        return
      }
      case 'addDependency': {
        const dependent = next.events.find((e) => e.id === action.eventId)
        const prerequisite = next.events.find((e) => e.id === action.prerequisiteSeriesId)
        if (!dependent || !prerequisite) return
        // Clear any same-day edge first (its stored timestamps may predate a
        // series time edit) so re-adding can't create a duplicate row.
        const dep = dayRange(action.date)
        const pre = dayRange(action.prerequisiteDate)
        const del = await supabase
          .from('occurrence_dependency')
          .delete()
          .eq('dependent_series', dependent.id)
          .gte('dependent_occurrence', dep.from)
          .lt('dependent_occurrence', dep.to)
          .eq('prerequisite_series', prerequisite.id)
          .gte('prerequisite_occurrence', pre.from)
          .lt('prerequisite_occurrence', pre.to)
        if (del.error) throw del.error
        const { error } = await supabase.from('occurrence_dependency').upsert(
          {
            dependent_series: dependent.id,
            dependent_occurrence: occurrenceTs(dependent, action.date),
            prerequisite_series: prerequisite.id,
            prerequisite_occurrence: occurrenceTs(prerequisite, action.prerequisiteDate),
            required_status: action.requiredStatus,
          },
          {
            onConflict:
              'dependent_series,dependent_occurrence,prerequisite_series,prerequisite_occurrence',
          },
        )
        if (error) throw error
        return
      }
      case 'removeDependency': {
        const dependent = next.events.find((e) => e.id === action.eventId)
        const prerequisite = next.events.find((e) => e.id === action.prerequisiteSeriesId)
        if (!dependent || !prerequisite) return
        // Match both occurrence slots by day range: their stored timestamps may
        // predate a series time edit.
        const dep = dayRange(action.date)
        const pre = dayRange(action.prerequisiteDate)
        const { error } = await supabase
          .from('occurrence_dependency')
          .delete()
          .eq('dependent_series', dependent.id)
          .gte('dependent_occurrence', dep.from)
          .lt('dependent_occurrence', dep.to)
          .eq('prerequisite_series', prerequisite.id)
          .gte('prerequisite_occurrence', pre.from)
          .lt('prerequisite_occurrence', pre.to)
        if (error) throw error
        return
      }
      case 'renamePerson': {
        const { error } = await supabase
          .from('person')
          .update({ name: action.name })
          .eq('id', action.id)
        if (error) throw error
        return
      }
      case 'recolorPerson': {
        const { error } = await supabase
          .from('person')
          .update({ color: action.color })
          .eq('id', action.id)
        if (error) throw error
        return
      }
      // Preferences are a per-user JSON blob: any preference change writes the
      // whole (already-updated) `next.preferences` document for this user.
      case 'setColorPref':
      case 'clearColorPref':
      case 'setTimezone': {
        const { error } = await supabase.from('user_preference').upsert(
          {
            account_id: this.accountId,
            user_id: this.userId,
            // Preferences is a structured interface; the column is free-form Json.
            prefs: next.preferences as unknown as Json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,user_id' },
        )
        if (error) throw error
        return
      }
      case 'addList': {
        // Resolve by id when the action carries one (see addEvent); else the
        // reducer just appended it.
        const list = action.id
          ? next.lists.find((l) => l.id === action.id)
          : next.lists[next.lists.length - 1]
        if (!list) return
        const { error } = await supabase
          .from('list')
          .insert({
            id: list.id,
            account_id: this.accountId,
            title: list.title,
            sort_order: list.sortOrder,
          })
        if (error) throw error
        return
      }
      case 'renameList': {
        const { error } = await supabase
          .from('list')
          .update({ title: action.title })
          .eq('id', action.id)
        if (error) throw error
        return
      }
      case 'removeList': {
        // Cascade drops the list's items and any event links.
        const { error } = await supabase.from('list').delete().eq('id', action.id)
        if (error) throw error
        return
      }
      case 'addListItem': {
        // Resolve by id when the action carries one (see addEvent); else the
        // reducer just appended it to its list.
        const list = next.lists.find((l) => l.id === action.listId)
        const item = action.id
          ? list?.items.find((i) => i.id === action.id)
          : list?.items[list.items.length - 1]
        if (!item) return
        const { error } = await supabase.from('list_item').insert({
          id: item.id,
          list_id: action.listId,
          title: item.title,
          done: item.done,
          person_id: item.personId,
          group_label: item.groupLabel,
          due_on: item.dueOn,
          sort_order: item.sortOrder,
        })
        if (error) throw error
        return
      }
      case 'toggleListItem': {
        // `done` lives on the item (single context); read the post-toggle value.
        const item = next.lists
          .find((l) => l.id === action.listId)
          ?.items.find((t) => t.id === action.itemId)
        if (!item) return
        const { error } = await supabase
          .from('list_item')
          .update({ done: item.done })
          .eq('id', action.itemId)
        if (error) throw error
        return
      }
      case 'removeListItem': {
        const { error } = await supabase.from('list_item').delete().eq('id', action.itemId)
        if (error) throw error
        return
      }
      case 'editListItem': {
        const { error } = await supabase
          .from('list_item')
          .update({
            title: action.title,
            person_id: action.personId,
            group_label: action.group,
          })
          .eq('id', action.itemId)
        if (error) throw error
        return
      }
      case 'setListItemDue': {
        const { error } = await supabase
          .from('list_item')
          .update({ due_on: action.dueOn })
          .eq('id', action.itemId)
        if (error) throw error
        return
      }
      case 'linkListItem': {
        const ev = next.events.find((e) => e.id === action.eventId)
        if (!ev) return
        // Clear any same-day link first (see addDependency) to avoid duplicates.
        const { from, to } = dayRange(action.date)
        const del = await supabase
          .from('list_item_event_link')
          .delete()
          .eq('list_item_id', action.itemId)
          .eq('series_id', ev.id)
          .gte('occurrence_start', from)
          .lt('occurrence_start', to)
        if (del.error) throw del.error
        const { error } = await supabase.from('list_item_event_link').upsert(
          {
            list_item_id: action.itemId,
            series_id: ev.id,
            occurrence_start: occurrenceTs(ev, action.date),
          },
          { onConflict: 'list_item_id,series_id,occurrence_start' },
        )
        if (error) throw error
        return
      }
      case 'unlinkListItem': {
        const ev = next.events.find((e) => e.id === action.eventId)
        if (!ev) return
        // Range-match the slot: the stored timestamp may predate a series edit.
        const { from, to } = dayRange(action.date)
        const { error } = await supabase
          .from('list_item_event_link')
          .delete()
          .eq('list_item_id', action.itemId)
          .eq('series_id', ev.id)
          .gte('occurrence_start', from)
          .lt('occurrence_start', to)
        if (error) throw error
        return
      }
      // UI navigation + hydration: nothing to persist.
      case 'shiftWeek':
      case 'setWeek':
      case 'shiftDay':
      case 'setDay':
      case 'hydrate':
        return
    }
  }

  // ---- PER-OCCURRENCE STATE (owned by TanStack Query, src/data/completions.ts)
  // Direct write methods rather than apply() actions: this slice left the
  // reducer, so mutations carry the event object instead of reading it back
  // out of AppState. All row matching is by day range (see dayRange).

  /** Set (or clear, with null) an occurrence's explicit status. */
  async setOccurrenceStatus(
    ev: CalendarEvent,
    date: string,
    status: OccurrenceStatusCode | null,
  ): Promise<void> {
    const { from, to } = dayRange(date)
    if (status) {
      // Update the day's existing row if there is one (it may carry a
      // reschedule/cancel, and its timestamp may predate a series time edit);
      // insert a fresh row only when none exists.
      const { data, error: selErr } = await supabase
        .from('event_occurrence')
        .select('occurrence_start')
        .eq('series_id', ev.id)
        .gte('occurrence_start', from)
        .lt('occurrence_start', to)
        .limit(1)
      if (selErr) throw selErr
      const existing = data?.[0]
      const { error } = existing
        ? await supabase
            .from('event_occurrence')
            .update({ status })
            .eq('series_id', ev.id)
            .eq('occurrence_start', existing.occurrence_start)
        : await supabase
            .from('event_occurrence')
            .upsert(
              { series_id: ev.id, occurrence_start: occurrenceTs(ev, date), status },
              { onConflict: 'series_id,occurrence_start' },
            )
      if (error) throw error
    } else {
      // Clearing the status must not destroy a reschedule or cancellation
      // sharing the row: drop only rows that carry nothing else, and null the
      // status on any that do.
      const del = await supabase
        .from('event_occurrence')
        .delete()
        .eq('series_id', ev.id)
        .gte('occurrence_start', from)
        .lt('occurrence_start', to)
        .is('rescheduled_to', null)
        .is('rescheduled_duration', null)
        .eq('cancelled', false)
      if (del.error) throw del.error
      const upd = await supabase
        .from('event_occurrence')
        .update({ status: null })
        .eq('series_id', ev.id)
        .gte('occurrence_start', from)
        .lt('occurrence_start', to)
      if (upd.error) throw upd.error
    }
  }

  /**
   * One-off timing override for a single occurrence. Identity stays the
   * ORIGINAL slot; the new time/length go in the reschedule columns, leaving
   * any status/checklist ticks on the row intact.
   */
  async setOccurrenceOverride(
    ev: CalendarEvent,
    date: string,
    start: string,
    duration: number,
  ): Promise<void> {
    const { from, to } = dayRange(date)
    const override = {
      rescheduled_to: startToTs(start, ev.allDay),
      rescheduled_duration: durationToInterval(duration, ev.allDay),
    }
    const { data, error: selErr } = await supabase
      .from('event_occurrence')
      .select('occurrence_start')
      .eq('series_id', ev.id)
      .gte('occurrence_start', from)
      .lt('occurrence_start', to)
      .limit(1)
    if (selErr) throw selErr
    const existing = data?.[0]
    const { error } = existing
      ? await supabase
          .from('event_occurrence')
          .update(override)
          .eq('series_id', ev.id)
          .eq('occurrence_start', existing.occurrence_start)
      : await supabase
          .from('event_occurrence')
          .upsert(
            { series_id: ev.id, occurrence_start: occurrenceTs(ev, date), ...override },
            { onConflict: 'series_id,occurrence_start' },
          )
    if (error) throw error
  }

  /** Null the timing override but keep the row (it may still carry status). */
  async clearOccurrenceOverride(ev: CalendarEvent, date: string): Promise<void> {
    const { from, to } = dayRange(date)
    const { error } = await supabase
      .from('event_occurrence')
      .update({ rescheduled_to: null, rescheduled_duration: null })
      .eq('series_id', ev.id)
      .gte('occurrence_start', from)
      .lt('occurrence_start', to)
    if (error) throw error
  }

  /** Set one checklist entry's per-occurrence tick to an explicit value. */
  async setChecklistEntry(
    ev: CalendarEvent,
    date: string,
    entryId: string,
    checked: boolean,
  ): Promise<void> {
    const { from, to } = dayRange(date)
    // Both branches clear the day's row(s) by range first, so a tick written
    // before a series time edit (different stored timestamp, same date) can
    // still be found — and never duplicated.
    const del = await supabase
      .from('occurrence_item_state')
      .delete()
      .eq('series_id', ev.id)
      .eq('item_id', entryId)
      .gte('occurrence_start', from)
      .lt('occurrence_start', to)
    if (del.error) throw del.error
    if (checked) {
      const { error } = await supabase.from('occurrence_item_state').upsert(
        {
          series_id: ev.id,
          occurrence_start: occurrenceTs(ev, date),
          item_id: entryId,
          status: 'done',
        },
        { onConflict: 'series_id,occurrence_start,item_id' },
      )
      if (error) throw error
    }
  }

  /** Upsert a series and reconcile its rosters/attachments. `templateId` records
   *  provenance when this event was created from a template (else left as-is). */
  private async writeEvent(
    ev: CalendarEvent,
    { isNew, templateId }: { isNew: boolean; templateId?: string },
  ): Promise<void> {
    const series = {
      id: ev.id,
      account_id: this.accountId,
      title: ev.title,
      all_day: ev.allDay,
      dtstart: startToTs(ev.start, ev.allDay),
      duration: durationToInterval(ev.duration, ev.allDay),
      rrule: recurrenceToRRule(ev.recurrence),
      color_key: ev.colorKey ?? null,
      is_template: false,
      // Only stamp provenance on insert-from-template; updates omit it so an edit
      // never clobbers an existing link.
      ...(templateId ? { template_id: templateId } : {}),
      // Only stamp the creator on insert — an edit by a partner must not
      // reassign the series to them.
      ...(isNew ? { created_by: this.userId } : {}),
    }
    const up = await supabase.from('event_series').upsert(series, { onConflict: 'id' })
    if (up.error) throw up.error

    await Promise.all([
      this.syncAttendees(ev),
      this.syncChecklist(ev),
      this.syncNotes(ev),
      this.syncReminders(ev),
    ])
  }

  /**
   * Upsert a template series (`is_template = true`, no `dtstart`/`rrule`) and
   * reconcile its roster/attachments through the same helpers as a real event.
   */
  private async writeTemplate(t: EventTemplate): Promise<void> {
    const series = {
      id: t.id,
      account_id: this.accountId,
      title: t.title,
      all_day: t.allDay,
      dtstart: null,
      duration: durationToInterval(t.duration, t.allDay),
      rrule: null,
      is_template: true,
      created_by: this.userId,
    }
    const up = await supabase.from('event_series').upsert(series, { onConflict: 'id' })
    if (up.error) throw up.error

    await Promise.all([
      this.syncAttendees(t),
      this.syncChecklist(t),
      this.syncNotes(t),
      this.syncReminders(t),
    ])
  }

  private async syncAttendees(ev: SeriesAttachments): Promise<void> {
    // Upsert-then-prune rather than delete-all-then-insert: the roster is never
    // empty mid-sync for a concurrent reader, and two devices saving at once
    // can't fail the whole insert on a shared attendee's duplicate key.
    if (ev.attendees.length) {
      const up = await supabase.from('event_person').upsert(
        ev.attendees.map((person_id) => ({ series_id: ev.id, person_id })),
        { onConflict: 'series_id,person_id', ignoreDuplicates: true },
      )
      if (up.error) throw up.error
    }
    let del = supabase.from('event_person').delete().eq('series_id', ev.id)
    if (ev.attendees.length) del = del.not('person_id', 'in', `(${ev.attendees.join(',')})`)
    const res = await del
    if (res.error) throw res.error
  }

  private async syncChecklist(ev: SeriesAttachments): Promise<void> {
    // Upsert present items (preserves rows so ticks in occurrence_item_state
    // survive an edit), then delete only the list items that were removed.
    const desired = checklists(ev).flatMap((c, ci) =>
      c.items.map((item: ChecklistEntry, idx) => ({
        id: item.id,
        owner_series_id: ev.id,
        label: item.title,
        group_label: c.title ?? null,
        sort_order: ci * 1000 + idx,
        required: true,
        occurrence_start: null as string | null,
      })),
    )
    if (desired.length) {
      const up = await supabase.from('checklist_item').upsert(desired, { onConflict: 'id' })
      if (up.error) throw up.error
    }
    const keepIds = desired.map((d) => d.id)
    let del = supabase
      .from('checklist_item')
      .delete()
      .eq('owner_series_id', ev.id)
      .is('occurrence_start', null)
    if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
    const res = await del
    if (res.error) throw res.error
  }

  private async syncNotes(ev: SeriesAttachments): Promise<void> {
    // Keep the original author on notes that already exist — editing an event
    // must not reassign a partner's notes to the editor.
    const { data: existing, error: exErr } = await supabase
      .from('note')
      .select('id, author_id')
      .eq('owner_series_id', ev.id)
    if (exErr) throw exErr
    const authorById = new Map((existing ?? []).map((n) => [n.id, n.author_id]))
    const desired = noteAttachments(ev).map((n) => ({
      id: n.id,
      owner_series_id: ev.id,
      body: n.text,
      author_id: authorById.get(n.id) ?? this.userId,
    }))
    if (desired.length) {
      const up = await supabase.from('note').upsert(desired, { onConflict: 'id' })
      if (up.error) throw up.error
    }
    const keepIds = desired.map((d) => d.id)
    let del = supabase.from('note').delete().eq('owner_series_id', ev.id)
    if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
    const res = await del
    if (res.error) throw res.error
  }

  private async syncReminders(ev: SeriesAttachments): Promise<void> {
    const desired = ev.attachments
      .filter((a): a is Extract<Attachment, { kind: 'reminder' }> => a.kind === 'reminder')
      .map((r) => ({
        id: r.id,
        series_id: ev.id,
        user_id: this.userId,
        offset_seconds: Math.round(r.offset * 60),
        method: 'app',
      }))
    if (desired.length) {
      const up = await supabase.from('reminder').upsert(desired, { onConflict: 'id' })
      if (up.error) throw up.error
    }
    const keepIds = desired.map((d) => d.id)
    let del = supabase.from('reminder').delete().eq('series_id', ev.id).eq('user_id', this.userId)
    if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
    const res = await del
    if (res.error) throw res.error
  }
}

/**
 * Rebuild Phase-1 ordered attachments from the relational children. Note: the
 * DB doesn't store the polymorphic display order, so attachments come back
 * grouped — checklists, then notes, then reminders — not necessarily in the
 * order they were authored. Content round-trips; interleaving order does not.
 */
function rebuildAttachments(r: SeriesRow): Attachment[] {
  const out: Attachment[] = []

  // Sort before grouping: the embed arrives in arbitrary order, and sort_order
  // encodes the group order (ci*1000+idx), so first-encounter grouping over the
  // sorted rows reproduces the authored checklist order deterministically.
  const listItems = r.checklist_item
    .filter((c) => c.occurrence_start === null)
    .sort((a, b) => a.sort_order - b.sort_order)
  const groups = new Map<string, typeof listItems>()
  for (const item of listItems) {
    const key = item.group_label ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  for (const [groupLabel, items] of groups) {
    out.push({
      // Deterministic id so a checklist keeps its identity across reloads.
      id: `${r.id}:checklist:${groupLabel}`,
      kind: 'checklist',
      title: groupLabel || undefined,
      items: items.map((i) => ({ id: i.id, title: i.label })),
    })
  }

  for (const n of r.note) out.push({ id: n.id, kind: 'note', text: n.body })
  for (const rem of r.reminder)
    out.push({ id: rem.id, kind: 'reminder', offset: Math.round(rem.offset_seconds / 60) })

  return out
}
