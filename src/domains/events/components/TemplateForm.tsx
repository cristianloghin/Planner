import { type ReactNode, useEffect, useRef } from 'react'
import { COLOR_OPTIONS } from '../../../assets/palette'
import shared from '../../../assets/styles/shared.module.css'
import { ColorPicker } from '../../../assets/ui/ColorPicker'
import { NumberField } from '../../../assets/ui/NumberField'
import { SNAP, type TemplateDraft } from '../draft'
import { RemindersEditor } from './RemindersEditor'
import styles from './TemplateForm.module.css'

/**
 * The template form's fields: what a new event made from it inherits. A
 * template has no point in time and no people, so there is no date, no
 * recurrence and nobody to pick; it names a colour instead.
 * Controlled: it shows `draft` and reports every change through `onChange`.
 */
export function TemplateForm({
  draft,
  onChange,
  note,
}: {
  draft: TemplateDraft
  onChange: (next: TemplateDraft) => void
  /** The template's note editor, when the route has one to show. */
  note?: ReactNode
}) {
  const set = (patch: Partial<TemplateDraft>) => onChange({ ...draft, ...patch })
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <>
      <div className={styles.row}>
        {/* The colour sits with the name, as a person's does in Settings. */}
        <ColorPicker
          options={COLOR_OPTIONS}
          value={draft.colorKey}
          ariaLabel="Template color"
          onChange={(colorKey) => set({ colorKey })}
        />
        <input
          ref={titleRef}
          placeholder="Template name"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>

      <label className={shared.toggle}>
        <input
          type="checkbox"
          checked={draft.allDay}
          onChange={(e) => set({ allDay: e.target.checked })}
        />
        All-day
      </label>

      {draft.allDay ? (
        <div className={shared.row}>
          <label className={shared.field}>
            Spans (days)
            <NumberField min={1} value={draft.days} onChange={(days) => set({ days })} />
          </label>
        </div>
      ) : (
        <div className={shared.row}>
          <label className={shared.field}>
            Hours
            <NumberField min={0} value={draft.hours} onChange={(hours) => set({ hours })} />
          </label>
          <label className={shared.field}>
            Minutes
            <NumberField
              min={0}
              max={59}
              step={SNAP}
              value={draft.minutes}
              onChange={(minutes) => set({ minutes })}
            />
          </label>
        </div>
      )}

      <RemindersEditor reminders={draft.reminders} onChange={(reminders) => set({ reminders })} />

      {note && (
        <>
          <label className={shared.label}>Note</label>
          {note}
        </>
      )}
    </>
  )
}
