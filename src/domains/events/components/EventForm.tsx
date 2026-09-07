import { useEffect, useRef, useState } from "react";
import { COLOR_OPTIONS, type ColorKey, DEFAULT_COLOR } from "../../../assets/palette";
import shared from "../../../assets/styles/shared.module.css";
import { ColorPicker } from "../../../assets/ui/ColorPicker";
import { NumberField } from "../../../assets/ui/NumberField";
import { addDays, diffDays } from "../../../assets/utils/dates";
import { AttendeeChips } from "../../people/components/AttendeeChips";
import type { Person } from "../../people/types";
import {
  type EndsChoice,
  type EventDraft,
  type RepeatChoice,
  SNAP,
  applyTemplate,
  moveStart,
} from "../draft";
import type { EventTemplate } from "../types";
import { RemindersEditor } from "./RemindersEditor";

import styles from "./EventForm.module.css";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The event form's fields. Controlled: it shows `draft` and reports every
 * change through `onChange`; it never decides what a save means. What it does
 * own is the small UI state around the fields — which template was picked,
 * the "saved" flash — and the first focus.
 */
export function EventForm({
  draft,
  onChange,
  isEdit,
  seriesStart,
  people,
  templates,
  onSaveAsTemplate,
}: {
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  isEdit: boolean;
  /** The series' own anchor day: a series may end before an opened occurrence. */
  seriesStart?: string;
  people: { person: Person; color: ColorKey }[];
  templates: EventTemplate[];
  onSaveAsTemplate: () => void;
}) {
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch });

  // Which template a *new* event was started from. Nothing is stored about
  // it; it only drives the select.
  const [templateId, setTemplateId] = useState<string | null>(null);
  // Transient "Saved to templates" confirmation.
  const [savedTemplate, setSavedTemplate] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  function saveAsTemplate() {
    onSaveAsTemplate();
    setSavedTemplate(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedTemplate(false), 2000);
  }

  const firstColor =
    people.find((p) => p.person.id === draft.attendees[0])?.color ?? DEFAULT_COLOR;
  const unitLabel =
    draft.repeat === "daily" ? "days" : draft.repeat === "weekly" ? "weeks" : "months";

  return (
    <>
      {!isEdit && templates.length > 0 && (
        <div className={shared.row}>
          <label className={shared.field}>
            Start from a template
            <select
              value={templateId ?? ""}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                setTemplateId(t ? t.id : null);
                if (t) onChange(applyTemplate(draft, t));
              }}
            >
              <option value="">Blank event</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || "Untitled template"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <input
        ref={titleRef}
        placeholder="What's the plan?"
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
            Date
            <input
              type="date"
              value={draft.date}
              onChange={(e) => set({ date: e.target.value })}
            />
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
                if (!ISO_DATE_RE.test(e.target.value)) return;
                set({ days: Math.max(1, diffDays(e.target.value, draft.date) + 1) });
              }}
            />
          </label>
        </div>
      ) : (
        <div className={shared.row}>
          <label className={shared.field}>
            Starts
            <input
              type="datetime-local"
              step={SNAP * 60}
              value={draft.startDT}
              onChange={(e) => onChange(moveStart(draft, e.target.value))}
            />
          </label>
          <label className={shared.field}>
            Ends
            <input
              type="datetime-local"
              step={SNAP * 60}
              value={draft.endDT}
              onChange={(e) => set({ endDT: e.target.value })}
            />
          </label>
        </div>
      )}

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
        {draft.repeat !== "none" && (
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

      {draft.repeat !== "none" && (
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
          {draft.ends === "after" && (
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
          {draft.ends === "on" && (
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

      <div className={styles.templateBar}>
        <button
          type="button"
          className={styles.saveTemplate}
          onClick={saveAsTemplate}
          disabled={!draft.title.trim()}
        >
          {savedTemplate ? "Saved to templates ✓" : "Save as template"}
        </button>
      </div>

      {/* Delete lives in the OccurrenceSheet toolbar — one tap from the event
          itself, rather than behind Edit and a full scroll of this form. */}
    </>
  );
}
