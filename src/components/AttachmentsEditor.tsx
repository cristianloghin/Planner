import { useState } from 'react'
import { cx } from '../lib/cx'
import { uid } from '../lib/id'
import { REMINDER_OFFSETS, offsetLabel } from '../lib/notifications'
import shared from '../styles/shared.module.css'
import type { Attachment, ChecklistEntry } from '../types'
import s from './AttachmentsEditor.module.css'

/**
 * Shared editor for the attachments an event or template carries: reminder
 * offsets, notes and checklists. Owns no state of its own — it edits the passed
 * `attachments` array through `onChange`, so EventEditor and the Settings
 * template editor stay perfectly in sync on what an attachment can be.
 */
export function AttachmentsEditor({
  attachments,
  onChange,
}: {
  attachments: Attachment[]
  onChange: (next: Attachment[]) => void
}) {
  const reminderSet = new Set(
    attachments.filter((a) => a.kind === 'reminder').map((a) => (a as { offset: number }).offset),
  )

  function toggleReminder(offset: number) {
    onChange(
      reminderSet.has(offset)
        ? attachments.filter((a) => !(a.kind === 'reminder' && a.offset === offset))
        : [...attachments, { id: uid(), kind: 'reminder', offset }],
    )
  }

  function addNote() {
    onChange([...attachments, { id: uid(), kind: 'note', text: '' }])
  }
  function addChecklist() {
    onChange([...attachments, { id: uid(), kind: 'checklist', items: [] }])
  }
  function updateAttachment(id: string, patch: Partial<Attachment>) {
    onChange(attachments.map((a) => (a.id === id ? ({ ...a, ...patch } as Attachment) : a)))
  }
  function removeAttachment(id: string) {
    onChange(attachments.filter((a) => a.id !== id))
  }

  return (
    <>
      <label className={shared.label}>Remind me</label>
      <div className={shared.chips}>
        {REMINDER_OFFSETS.map((o) => {
          const on = reminderSet.has(o)
          return (
            <button
              type="button"
              key={o}
              className={cx(shared.chip, on && shared.on)}
              style={
                on
                  ? {
                      background: 'var(--accent)',
                      borderColor: 'var(--accent)',
                    }
                  : undefined
              }
              onClick={() => toggleReminder(o)}
            >
              {offsetLabel(o)}
            </button>
          )
        })}
      </div>

      <div className={s.attachments}>
        {attachments
          .filter((a) => a.kind !== 'reminder')
          .map((a) =>
            a.kind === 'note' ? (
              <NoteEditor
                key={a.id}
                text={a.text}
                onChange={(text) => updateAttachment(a.id, { text })}
                onRemove={() => removeAttachment(a.id)}
              />
            ) : (
              <ChecklistEditor
                key={a.id}
                title={a.title ?? ''}
                items={a.items}
                onChange={(patch) => updateAttachment(a.id, patch)}
                onRemove={() => removeAttachment(a.id)}
              />
            ),
          )}
        <div className={s.addRow}>
          <button type="button" className={s.addAttachment} onClick={addNote}>
            + Note
          </button>
          <button type="button" className={s.addAttachment} onClick={addChecklist}>
            + Checklist
          </button>
        </div>
      </div>
    </>
  )
}

function NoteEditor({
  text,
  onChange,
  onRemove,
}: {
  text: string
  onChange: (text: string) => void
  onRemove: () => void
}) {
  return (
    <div className={s.attachment}>
      <div className={s.attachmentHead}>
        <span className={s.attachmentKind}>Note</span>
        <button
          type="button"
          className={s.attachmentDel}
          onClick={onRemove}
          aria-label="Remove note"
        >
          ×
        </button>
      </div>
      <textarea
        className={s.note}
        rows={3}
        placeholder="Add a note…"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function ChecklistEditor({
  title,
  items,
  onChange,
  onRemove,
}: {
  title: string
  items: ChecklistEntry[]
  onChange: (patch: { title?: string; items?: ChecklistEntry[] }) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState('')

  function addEntry() {
    if (!draft.trim()) return
    onChange({ items: [...items, { id: uid(), title: draft.trim() }] })
    setDraft('')
  }

  return (
    <div className={s.attachment}>
      <div className={s.attachmentHead}>
        <input
          className={s.checklistTitle}
          placeholder="Checklist"
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button
          type="button"
          className={s.attachmentDel}
          onClick={onRemove}
          aria-label="Remove checklist"
        >
          ×
        </button>
      </div>
      <ul className={s.checklistItems}>
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.title}</span>
            <button
              type="button"
              className={s.attachmentDel}
              onClick={() => onChange({ items: items.filter((x) => x.id !== it.id) })}
              aria-label="Remove item"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className={s.checklistAdd}>
        <input
          placeholder="Add an item…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addEntry()
            }
          }}
        />
        <button type="button" onClick={addEntry}>
          Add
        </button>
      </div>
    </div>
  )
}
