import type { Attachment, CalendarEvent, ChecklistEntry } from '../types'

type NoteAttachment = Extract<Attachment, { kind: 'note' }>
type ChecklistAttachment = Extract<Attachment, { kind: 'checklist' }>
type ReminderAttachment = Extract<Attachment, { kind: 'reminder' }>

export function notes(e: CalendarEvent): NoteAttachment[] {
  return e.attachments.filter((a): a is NoteAttachment => a.kind === 'note')
}

export function checklists(e: CalendarEvent): ChecklistAttachment[] {
  return e.attachments.filter((a): a is ChecklistAttachment => a.kind === 'checklist')
}

/** Every checklist entry across all checklist attachments. */
export function checklistEntries(e: CalendarEvent): ChecklistEntry[] {
  return checklists(e).flatMap((c) => c.items)
}

export function hasChecklist(e: CalendarEvent): boolean {
  return checklistEntries(e).length > 0
}

/** Reminder offsets (minutes before start) attached to the event, ascending. */
export function reminderOffsets(e: CalendarEvent): number[] {
  return e.attachments
    .filter((a): a is ReminderAttachment => a.kind === 'reminder')
    .map((a) => a.offset)
    .sort((a, b) => a - b)
}

export function hasReminders(e: CalendarEvent): boolean {
  return e.attachments.some((a) => a.kind === 'reminder')
}
