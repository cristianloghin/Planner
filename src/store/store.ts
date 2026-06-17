import type {
  AppState,
  CalendarEvent,
  Household,
  Member,
  MemberId,
  MemberRole,
  Reminder,
  Task,
} from '../types'
import { addDays, mondayOf } from '../lib/dates'
import { nowISO, uid, withMeta } from '../lib/sync'

/**
 * Storage abstraction. Phase 1 is backed by localStorage (single device).
 * Phase 2 swaps in a Supabase-backed store implementing this same interface —
 * the entity shapes (household, members, events, ...) map directly to tables.
 */
export interface ScheduleStore {
  load(): AppState
  save(state: AppState): void
}

export function defaultState(): AppState {
  const today = new Date()
  const household = withMeta({ name: 'Home' }) as Household
  const hid = household.id
  const member = (name: string, color: string, role: MemberRole): Member =>
    withMeta({ householdId: hid, name, color, role }) as Member
  return {
    household,
    members: [
      member('Me', '#4f46e5', 'adult'),
      member('Partner', '#ec4899', 'adult'),
      member('Nora', '#14b8a6', 'child'),
    ],
    tasks: [],
    events: [],
    reminders: [],
    weekStart: mondayOf(today),
    selectedDay: (today.getDay() + 6) % 7, // 0 = Monday
  }
}

// ---- Legacy migration -------------------------------------------------------
// We still read two older shapes: events keyed by `personId`/`day` (pre-attendees,
// pre-absolute-date) and the people-Record / no-sync-metadata layout.

/* eslint-disable @typescript-eslint/no-explicit-any */
function toISO(v: unknown, fallback: string): string {
  if (typeof v === 'number') return new Date(v).toISOString()
  if (typeof v === 'string' && v) return v
  return fallback
}

function migrateMembers(parsed: any, hid: string, now: string): Member[] {
  const people = parsed.people ? Object.values(parsed.people) : []
  if (!people.length) {
    return defaultState().members.map((m) => ({ ...m, householdId: hid }))
  }
  return people.map((p: any) => ({
    id: p.id ?? uid(),
    householdId: hid,
    name: p.name,
    color: p.color,
    role: (p.id === 'kid' ? 'child' : 'adult') as MemberRole,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }))
}

function migrateEvent(e: any, hid: string, weekStart: string, now: string): CalendarEvent {
  const attendees: MemberId[] =
    Array.isArray(e.attendees) && e.attendees.length
      ? e.attendees
      : e.personId === 'both'
        ? ['me', 'partner']
        : [e.personId ?? 'me']
  return {
    id: e.id ?? uid(),
    householdId: hid,
    title: e.title,
    date: e.date ?? addDays(weekStart, e.day ?? 0),
    allDay: e.allDay ?? false,
    start: e.start ?? 9 * 60,
    end: e.end ?? 10 * 60,
    days: e.days ?? 1,
    recurrence: e.recurrence,
    attendees,
    reminders: e.reminders,
    notes: e.notes,
    createdAt: toISO(e.createdAt, now),
    updatedAt: now,
    deletedAt: e.deletedAt ?? null,
  }
}

function migrate(parsed: any): AppState {
  const base = defaultState()

  // Already on the household/members shape — trust it, backfill missing bits.
  if (parsed && parsed.members && parsed.household) {
    return {
      household: parsed.household,
      members: parsed.members,
      tasks: parsed.tasks ?? [],
      events: parsed.events ?? [],
      reminders: parsed.reminders ?? [],
      weekStart: parsed.weekStart ?? base.weekStart,
      selectedDay: parsed.selectedDay ?? base.selectedDay,
    }
  }

  const now = nowISO()
  const household = base.household
  const hid = household.id
  const weekStart = parsed?.weekStart ?? base.weekStart

  const tasks: Task[] = (parsed?.tasks ?? []).map((t: any) => ({
    id: t.id ?? uid(),
    householdId: hid,
    title: t.title,
    done: !!t.done,
    memberId: t.memberId ?? t.personId ?? null,
    createdAt: toISO(t.createdAt, now),
    updatedAt: now,
    deletedAt: t.deletedAt ?? null,
  }))

  const reminders: Reminder[] = (parsed?.reminders ?? []).map((r: any) => ({
    id: r.id ?? uid(),
    householdId: hid,
    title: r.title,
    date: r.date,
    time: r.time,
    repeat: r.repeat ?? 'none',
    createdAt: now,
    updatedAt: now,
    deletedAt: r.deletedAt ?? null,
  }))

  return {
    household,
    members: migrateMembers(parsed ?? {}, hid, now),
    tasks,
    events: (parsed?.events ?? []).map((e: any) => migrateEvent(e, hid, weekStart, now)),
    reminders,
    weekStart,
    selectedDay: parsed?.selectedDay ?? base.selectedDay,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const STORAGE_KEY = 'planner.state.v1'

export class LocalStorageStore implements ScheduleStore {
  load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultState()
      return migrate(JSON.parse(raw))
    } catch {
      return defaultState()
    }
  }

  save(state: AppState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota / private-mode write failures for now.
    }
  }
}

export function createStore(): ScheduleStore {
  return new LocalStorageStore()
}
