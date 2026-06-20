import type { Attachment, ChecklistEntry } from '../types'
import { uid } from './id'

type NoteAttachment = Extract<Attachment, { kind: 'note' }>
type ChecklistAttachment = Extract<Attachment, { kind: 'checklist' }>
type ReminderAttachment = Extract<Attachment, { kind: 'reminder' }>

// Anything carrying attachments (a CalendarEvent or an EventTemplate). These
// readers only ever look at `.attachments`, so they accept the narrow shape.
type WithAttachments = { attachments: Attachment[] }

export function notes(e: WithAttachments): NoteAttachment[] {
  return e.attachments.filter((a): a is NoteAttachment => a.kind === 'note')
}

export function checklists(e: WithAttachments): ChecklistAttachment[] {
  return e.attachments.filter((a): a is ChecklistAttachment => a.kind === 'checklist')
}

/** Every checklist entry across all checklist attachments. */
export function checklistEntries(e: WithAttachments): ChecklistEntry[] {
  return checklists(e).flatMap((c) => c.items)
}

export function hasChecklist(e: WithAttachments): boolean {
  return checklistEntries(e).length > 0
}

/** Reminder offsets (minutes before start) attached to the event, ascending. */
export function reminderOffsets(e: WithAttachments): number[] {
  return e.attachments
    .filter((a): a is ReminderAttachment => a.kind === 'reminder')
    .map((a) => a.offset)
    .sort((a, b) => a - b)
}

export function hasReminders(e: WithAttachments): boolean {
  return e.attachments.some((a) => a.kind === 'reminder')
}

/**
 * Deep-copy attachments with **fresh ids** at every level (the attachment and
 * each checklist entry). Used by the template ↔ event copy paths: the copy owns
 * brand-new `checklist_item`/`note`/`reminder` rows, never aliasing the source's.
 */
export function cloneAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.map((a) => {
    if (a.kind === 'checklist') {
      return {
        ...a,
        id: uid(),
        items: a.items.map((it) => ({ ...it, id: uid() })),
      }
    }
    return { ...a, id: uid() }
  })
}
