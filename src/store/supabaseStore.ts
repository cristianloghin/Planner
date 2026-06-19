import type {
  AppState,
  Attachment,
  CalendarEvent,
  ChecklistEntry,
  ListItem,
  OccurrenceDependency,
  OccurrenceStatusCode,
  Person,
  Preferences,
} from '../types'
import type { Action } from './actions'
import type { Json } from '../lib/database.types'
import type { ScheduleStore } from './store'
import { defaultState } from './store'
import { supabase } from '../lib/supabase'
import { uid } from '../lib/id'
import { toISODate, toDateTimeLocal } from '../lib/dates'
import { notes as noteAttachments, checklists } from '../lib/attachments'
import { recurrenceToRRule, rruleToRecurrence } from '../lib/rrule'

const MINS_PER_DAY = 24 * 60

// Standalone Lists have no backend table yet (deferred): they stay device-local
// in localStorage so the Lists tab keeps working without syncing.
const LISTS_KEY = 'planner.lists.v1'

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
  const timeM = iv.match(/(\d{1,2}):(\d{2}):(\d{2})/)
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

// ---- Row shapes (kept local; the generated types don't model embeds well) --

interface SeriesRow {
  id: string
  title: string
  all_day: boolean
  dtstart: string | null
  duration: string | null
  rrule: string | null
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

export class SupabaseStore implements ScheduleStore {
  constructor(
    private readonly accountId: string,
    private readonly userId: string,
  ) {}

  // ---- READ --------------------------------------------------------------

  async load(): Promise<AppState> {
    const base = defaultState()

    const [people, events, completions, dependencies, preferences] = await Promise.all([
      this.loadPeople(),
      this.loadEvents(),
      this.loadCompletions(),
      this.loadDependencies(),
      this.loadPreferences(),
    ])

    return {
      ...base,
      people,
      events,
      completions,
      dependencies,
      preferences,
      lists: this.loadLists(),
    }
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
    return { ...empty, ...prefs, personColors: { ...empty.personColors, ...prefs.personColors } }
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
    const { data, error } = await supabase
      .from('event_series')
      // FK-column hints (table!fk_col) disambiguate the embeds: PostgREST sees
      // more than one relationship between event_series and these children
      // (e.g. checklist_item also links many-to-many via occurrence_item_removed).
      .select(
        `id, title, all_day, dtstart, duration, rrule,
         event_person!series_id ( person_id ),
         checklist_item!owner_series_id ( id, label, group_label, sort_order, occurrence_start ),
         note!owner_series_id ( id, body ),
         reminder!series_id ( id, offset_seconds )`,
      )
      .eq('account_id', this.accountId)
      .eq('is_template', false)
    if (error) throw error

    const rows = (data ?? []) as unknown as SeriesRow[]
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
        attachments: rebuildAttachments(r),
      }
    })
  }

  /**
   * Prerequisite edges, keyed by the dependent occurrence (`${seriesId}:${date}`)
   * to match `AppState.dependencies`. Each `occurrence_dependency` row carries
   * timestamptz slots on both ends; we key/store them as occurrence dates.
   */
  private async loadDependencies(): Promise<Record<string, OccurrenceDependency[]>> {
    const { data, error } = await supabase
      .from('occurrence_dependency')
      .select('dependent_series, dependent_occurrence, prerequisite_series, prerequisite_occurrence, required_status')
    if (error) throw error
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

  private async loadCompletions(): Promise<Record<string, import('../types').OccurrenceState>> {
    const completions: Record<string, import('../types').OccurrenceState> = {}
    const key = (seriesId: string, ts: string) => `${seriesId}:${tsToDateKey(ts)}`

    const [occ, items] = await Promise.all([
      supabase.from('event_occurrence').select('series_id, occurrence_start, status'),
      supabase.from('occurrence_item_state').select('series_id, occurrence_start, item_id, status'),
    ])
    if (occ.error) throw occ.error
    if (items.error) throw items.error

    for (const o of occ.data ?? []) {
      if (o.status) {
        const k = key(o.series_id, o.occurrence_start)
        completions[k] = { ...completions[k], status: o.status as OccurrenceStatusCode }
      }
    }
    for (const it of items.data ?? []) {
      const k = key(it.series_id, it.occurrence_start)
      const checked = { ...(completions[k]?.checked ?? {}) }
      checked[it.item_id] = it.status === 'done'
      completions[k] = { ...completions[k], checked }
    }
    return completions
  }

  private loadLists(): ListItem[] {
    try {
      const raw = localStorage.getItem(LISTS_KEY)
      return raw ? (JSON.parse(raw) as ListItem[]) : []
    } catch {
      return []
    }
  }

  // ---- SUBSCRIBE ---------------------------------------------------------

  /**
   * Fire `onChange` whenever any calendar table changes (including our own
   * writes — the caller debounces and reloads idempotently). RLS scopes the
   * stream to this user's account, so no per-account filter is needed. Returns
   * an unsubscribe fn.
   */
  subscribe(onChange: () => void): () => void {
    const channel = supabase
      .channel('account-data')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => onChange())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }

  // ---- WRITE -------------------------------------------------------------

  async apply(action: Action, next: AppState): Promise<void> {
    switch (action.type) {
      case 'addEvent': {
        // The reducer appends the new (id-stamped) event; persist that one.
        const ev = next.events[next.events.length - 1]
        if (ev) await this.writeEvent(ev)
        return
      }
      case 'updateEvent':
        await this.writeEvent(action.event)
        return
      case 'removeEvent': {
        const { error } = await supabase.from('event_series').delete().eq('id', action.id)
        if (error) throw error
        return
      }
      case 'setOccurrenceStatus': {
        const ev = next.events.find((e) => e.id === action.eventId)
        if (!ev) return
        const occurrence_start = occurrenceTs(ev, action.date)
        if (action.status) {
          const { error } = await supabase
            .from('event_occurrence')
            .upsert(
              { series_id: ev.id, occurrence_start, status: action.status },
              { onConflict: 'series_id,occurrence_start' },
            )
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('event_occurrence')
            .delete()
            .eq('series_id', ev.id)
            .eq('occurrence_start', occurrence_start)
          if (error) throw error
        }
        return
      }
      case 'addDependency': {
        const dependent = next.events.find((e) => e.id === action.eventId)
        const prerequisite = next.events.find((e) => e.id === action.prerequisiteSeriesId)
        if (!dependent || !prerequisite) return
        const { error } = await supabase.from('occurrence_dependency').upsert(
          {
            dependent_series: dependent.id,
            dependent_occurrence: occurrenceTs(dependent, action.date),
            prerequisite_series: prerequisite.id,
            prerequisite_occurrence: occurrenceTs(prerequisite, action.prerequisiteDate),
            required_status: action.requiredStatus,
          },
          { onConflict: 'dependent_series,dependent_occurrence,prerequisite_series,prerequisite_occurrence' },
        )
        if (error) throw error
        return
      }
      case 'removeDependency': {
        const dependent = next.events.find((e) => e.id === action.eventId)
        const prerequisite = next.events.find((e) => e.id === action.prerequisiteSeriesId)
        if (!dependent || !prerequisite) return
        const { error } = await supabase
          .from('occurrence_dependency')
          .delete()
          .eq('dependent_series', dependent.id)
          .eq('dependent_occurrence', occurrenceTs(dependent, action.date))
          .eq('prerequisite_series', prerequisite.id)
          .eq('prerequisite_occurrence', occurrenceTs(prerequisite, action.prerequisiteDate))
        if (error) throw error
        return
      }
      case 'toggleChecklistEntry': {
        const ev = next.events.find((e) => e.id === action.eventId)
        if (!ev) return
        const occurrence_start = occurrenceTs(ev, action.date)
        const nowChecked = next.completions[`${action.eventId}:${action.date}`]?.checked?.[action.entryId]
        if (nowChecked) {
          const { error } = await supabase.from('occurrence_item_state').upsert(
            { series_id: ev.id, occurrence_start, item_id: action.entryId, status: 'done' },
            { onConflict: 'series_id,occurrence_start,item_id' },
          )
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('occurrence_item_state')
            .delete()
            .eq('series_id', ev.id)
            .eq('occurrence_start', occurrence_start)
            .eq('item_id', action.entryId)
          if (error) throw error
        }
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
      case 'clearColorPref': {
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
      // Standalone lists are device-local for now.
      case 'addListItem':
      case 'toggleListItem':
      case 'removeListItem':
        this.saveLists(next.lists)
        return
      // UI navigation + hydration: nothing to persist.
      case 'shiftWeek':
      case 'setWeek':
      case 'shiftDay':
      case 'setDay':
      case 'hydrate':
        return
    }
  }

  /** Upsert a series and reconcile its rosters/attachments. */
  private async writeEvent(ev: CalendarEvent): Promise<void> {
    const series = {
      id: ev.id,
      account_id: this.accountId,
      title: ev.title,
      all_day: ev.allDay,
      dtstart: startToTs(ev.start, ev.allDay),
      duration: durationToInterval(ev.duration, ev.allDay),
      rrule: recurrenceToRRule(ev.recurrence),
      is_template: false,
      created_by: this.userId,
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

  private async syncAttendees(ev: CalendarEvent): Promise<void> {
    // No per-row dependents — delete-all then insert is safe and simplest.
    const del = await supabase.from('event_person').delete().eq('series_id', ev.id)
    if (del.error) throw del.error
    if (ev.attendees.length) {
      const ins = await supabase
        .from('event_person')
        .insert(ev.attendees.map((person_id) => ({ series_id: ev.id, person_id })))
      if (ins.error) throw ins.error
    }
  }

  private async syncChecklist(ev: CalendarEvent): Promise<void> {
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
    let del = supabase.from('checklist_item').delete().eq('owner_series_id', ev.id).is('occurrence_start', null)
    if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
    const res = await del
    if (res.error) throw res.error
  }

  private async syncNotes(ev: CalendarEvent): Promise<void> {
    const desired = noteAttachments(ev).map((n) => ({
      id: n.id,
      owner_series_id: ev.id,
      body: n.text,
      author_id: this.userId,
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

  private async syncReminders(ev: CalendarEvent): Promise<void> {
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

  private saveLists(lists: ListItem[]): void {
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists))
    } catch {
      // ignore quota / private-mode failures
    }
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

  const listItems = r.checklist_item.filter((c) => c.occurrence_start === null)
  const groups = new Map<string, typeof listItems>()
  for (const item of listItems) {
    const key = item.group_label ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  for (const [groupLabel, items] of groups) {
    out.push({
      id: uid(),
      kind: 'checklist',
      title: groupLabel || undefined,
      items: items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ id: i.id, title: i.label })),
    })
  }

  for (const n of r.note) out.push({ id: n.id, kind: 'note', text: n.body })
  for (const rem of r.reminder)
    out.push({ id: rem.id, kind: 'reminder', offset: Math.round(rem.offset_seconds / 60) })

  return out
}
