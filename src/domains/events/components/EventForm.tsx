import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { COLOR_OPTIONS, type ColorKey, DEFAULT_COLOR } from '../../../assets/palette'
import shared from '../../../assets/styles/shared.module.css'
import { ColorPicker } from '../../../assets/ui/ColorPicker'
import { NumberField } from '../../../assets/ui/NumberField'
import {
  addDays,
  changeDate,
  changeTime,
  diffDays,
  getDate,
  getTime,
} from '../../../assets/utils/dates'
import { AttendeeChips } from '../../people/components/AttendeeChips'
import type { Person } from '../../people/types'
import {
  type EditScope,
  type EndsChoice,
  type EventDraft,
  type RepeatChoice,
  applyTemplate,
  moveStart,
} from '../draft'
import type { EventTemplate } from '../types'
import { RemindersEditor } from './RemindersEditor'

import { EllipsisVertical } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '../../../assets/ui/Button'
import { cx } from '../../../assets/utils/cx'
import s from './EventForm.module.css'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The event form's fields. Controlled: it shows `draft` and reports every
 * change through `onChange`; it never decides what a save means. What it does
 * own is the small UI state around the fields — which template was picked,
 * the "saved" flash — and the first focus.
 *
 * Editing one occurrence shows only what an occurrence can differ in — when
 * it happens and who is on it. The title, repeat rule, colour and reminders
 * are the series' and stay out of sight. Editing this and the following
 * occurrences is a new series from that day, so it shows everything.
 */
export function EventForm({
  draft,
  onChange,
  isEdit,
  scope = 'series',
  seriesStart,
  people,
  templates,
  onSaveAsTemplate,
  onPickTemplate,
  note,
}: {
  draft: EventDraft
  onChange: (next: EventDraft) => void
  isEdit: boolean
  scope?: EditScope
  /**
   * The first day the saved series can produce, which its last day cannot
   * precede: the series' own anchor, or the cut day when editing from one on.
   */
  seriesStart?: string
  people: { person: Person; color: ColorKey }[]
  templates: EventTemplate[]
  onSaveAsTemplate: () => void
  /** Which template the draft was just filled from, or null when cleared. */
  onPickTemplate?: (template: EventTemplate | null) => void
  /** The series' note editor, when the route has one to show. */
  note?: ReactNode
}) {
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch })

  // Which template a *new* event was started from. Nothing is stored about
  // it; it only drives the select.
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  // Transient "Saved to templates" confirmation.
  const [savedTemplate, setSavedTemplate] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  function saveAsTemplate() {
    onSaveAsTemplate()
    setSavedTemplate(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedTemplate(false), 2000)
  }

  const firstColor = people.find((p) => p.person.id === draft.attendees[0])?.color ?? DEFAULT_COLOR
  const unitLabel =
    draft.repeat === 'daily' ? 'days' : draft.repeat === 'weekly' ? 'weeks' : 'months'
  // The fields a series has and one occurrence of it does not.
  const seriesOnly = scope !== 'occurrence'

  const handleTemplateSelection = useCallback(
    (t: EventTemplate) => {
      setTemplateId(t ? t.id : null)
      if (t) onChange(applyTemplate(draft, t))
      onPickTemplate?.(t ?? null)
      setShowTemplates(false)
    },
    [draft, onChange, onPickTemplate],
  )

  return (
    <>
      {seriesOnly && (
        <div className={s.row}>
          <input
            ref={titleRef}
            placeholder="What's the plan?"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          {!isEdit && templates.length > 0 && (
            <SelectTemplate
              open={showTemplates}
              setOpen={setShowTemplates}
              selectedId={templateId}
              templates={templates}
              onSelect={handleTemplateSelection}
            />
          )}
        </div>
      )}

      {seriesOnly && (
        <label className={shared.toggle}>
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(e) => set({ allDay: e.target.checked })}
          />
          All-day
        </label>
      )}

      {draft.allDay ? (
        <div className={shared.row}>
          <label className={shared.field}>
            Date
            <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className={shared.field}>
            Ends
            <input
              type="date"
              // All-day duration is whole days, so the picked end date is
              // inclusive: ending on the start date is a one-day event.
              value={addDays(draft.date, Math.max(1, draft.days) - 1)}
              min={draft.date}
              onChange={(e) => {
                // A cleared/incomplete picker emits "" — ignore it rather
                // than compute NaN days.
                if (!ISO_DATE_RE.test(e.target.value)) return
                set({
                  days: Math.max(1, diffDays(e.target.value, draft.date) + 1),
                })
              }}
            />
          </label>
        </div>
      ) : (
        <>
          <div className={shared.row}>
            <DateInput
              label="Starts"
              dateString={draft.startDT}
              onChange={(d) => onChange(moveStart(draft, d))}
            />
          </div>
          <div className={shared.row}>
            <DateInput label="Ends" dateString={draft.endDT} onChange={(d) => set({ endDT: d })} />
          </div>
        </>
      )}

      {seriesOnly && (
        <div className={shared.row}>
          <label className={shared.field}>
            Repeats
            <select
              value={draft.repeat}
              onChange={(e) => set({ repeat: e.target.value as RepeatChoice })}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {draft.repeat !== 'none' && (
            <label className={shared.field}>
              Every
              <div className={shared.interval}>
                <NumberField
                  min={1}
                  value={draft.interval}
                  onChange={(interval) => set({ interval })}
                />
                <span>{unitLabel}</span>
              </div>
            </label>
          )}
        </div>
      )}

      {seriesOnly && draft.repeat !== 'none' && (
        <div className={shared.row}>
          <label className={shared.field}>
            Ends
            <select
              value={draft.ends}
              onChange={(e) => set({ ends: e.target.value as EndsChoice })}
            >
              <option value="never">Never</option>
              <option value="after">After…</option>
              <option value="on">On…</option>
            </select>
          </label>
          {draft.ends === 'after' && (
            <label className={shared.field}>
              Occurrences
              <div className={shared.interval}>
                <NumberField
                  min={1}
                  value={draft.endCount}
                  onChange={(endCount) => set({ endCount })}
                />
                <span>times</span>
              </div>
            </label>
          )}
          {draft.ends === 'on' && (
            <label className={shared.field}>
              Last day
              <input
                type="date"
                value={draft.endDate}
                min={seriesStart ?? draft.date}
                onChange={(e) => set({ endDate: e.target.value })}
              />
            </label>
          )}
        </div>
      )}

      <label className={shared.label}>Who's involved?</label>
      <AttendeeChips
        people={people}
        value={draft.attendees}
        onChange={(attendees) => set({ attendees })}
      />

      {seriesOnly && (
        <>
          <label className={shared.label}>Color</label>
          <ColorPicker
            options={COLOR_OPTIONS}
            value={draft.colorKey ?? null}
            defaultValue={firstColor}
            ariaLabel="Event color"
            onChange={(colorKey) => set({ colorKey })}
          />

          <RemindersEditor
            reminders={draft.reminders}
            onChange={(reminders) => set({ reminders })}
          />

          <div className={s.templateBar}>
            <button
              type="button"
              className={s.saveTemplate}
              onClick={saveAsTemplate}
              disabled={!draft.title.trim()}
            >
              {savedTemplate ? 'Saved to templates ✓' : 'Save as template'}
            </button>
          </div>

          {note && (
            <>
              <label className={shared.label}>Note</label>
              {note}
            </>
          )}
        </>
      )}
    </>
  )
}

function DateInput({
  label,
  dateString,
  onChange,
}: {
  label: string
  dateString: string
  onChange: (dateString: string) => void
}) {
  const date = getDate(dateString)
  const time = getTime(dateString)

  const handleChange = (e: ChangeEvent<HTMLInputElement>, type: 'date' | 'time') => {
    const d = e.target.value
    onChange(type === 'date' ? changeDate(dateString, d) : changeTime(dateString, d))
  }

  return (
    <div className={s.dateField}>
      <label>{label}</label>
      <input type="date" value={date} onChange={(e) => handleChange(e, 'date')} />
      <input type="time" value={time} onChange={(e) => handleChange(e, 'time')} />
    </div>
  )
}

function SelectTemplate({
  open,
  setOpen,
  selectedId,
  templates,
  onSelect,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  selectedId: string | null
  templates: EventTemplate[]
  onSelect: (t: EventTemplate) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={s.templateTrigger}>
        <EllipsisVertical />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.templatesCard}>
          <Dialog.Title className={s.title}>Select a template</Dialog.Title>
          {templates.map((t) => (
            <button
              key={t.id}
              className={cx(s.templateBtn, selectedId === t.id && s.active)}
              type="button"
              onClick={() => onSelect(t)}
            >
              {t.title || 'Untitled template'}
            </button>
          ))}
          <Dialog.Close asChild>
            <Button className={s.cancel} label="Cancel">
              Cancel
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
