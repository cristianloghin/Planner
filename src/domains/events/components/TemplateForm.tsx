import { useEffect, useRef } from 'react'
import type { ColorKey } from '../../../assets/palette'
import shared from '../../../assets/styles/shared.module.css'
import { NumberField } from '../../../assets/ui/NumberField'
import { AttendeeChips } from '../../people/components/AttendeeChips'
import type { Person } from '../../people/types'
import { SNAP, type TemplateDraft } from '../draft'
import { RemindersEditor } from './RemindersEditor'

/**
 * The template form's fields: what a new event made from it inherits. A
 * template has no point in time, so there is no date and no recurrence.
 * Controlled: it shows `draft` and reports every change through `onChange`.
 */
export function TemplateForm({
  draft,
  onChange,
  people,
}: {
  draft: TemplateDraft
  onChange: (next: TemplateDraft) => void
  people: { person: Person; color: ColorKey }[]
}) {
  const set = (patch: Partial<TemplateDraft>) => onChange({ ...draft, ...patch })
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <>
      <input
        ref={titleRef}
        placeholder="Template name"
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
      />

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

      <label className={shared.label}>Who's involved?</label>
      <AttendeeChips
        people={people}
        value={draft.attendees}
        onChange={(attendees) => set({ attendees })}
      />

      <RemindersEditor reminders={draft.reminders} onChange={(reminders) => set({ reminders })} />
    </>
  )
}
