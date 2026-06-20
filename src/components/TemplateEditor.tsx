import { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { Attachment, EventTemplate, PersonId } from "../types";
import { AttachmentsEditor } from "./AttachmentsEditor";
import { AttendeeChips } from "./AttendeeChips";

const SNAP = 15;

/**
 * Full-page editor for a saved event template (DATA_MODEL Decision 10). A
 * template is a blueprint with no point in time, so unlike {@link EventEditor}
 * there's no start date or recurrence — just the defaults a new event inherits:
 * title, all-day flag, default duration, attendees and attachments. Saving
 * dispatches `updateTemplate`; existing events made from it are untouched.
 */
export function TemplateEditor({
  template,
  onClose,
}: {
  template: EventTemplate;
  onClose: () => void;
}) {
  const { dispatch, beginEdit, endEdit } = useApp();

  // Defer realtime reloads while the draft is open (same guard as EventEditor).
  useEffect(() => {
    beginEdit();
    return endEdit;
  }, [beginEdit, endEdit]);

  const [title, setTitle] = useState(template.title);
  const [allDay, setAllDay] = useState(template.allDay);
  // All-day duration is whole days; timed duration is split into hours/minutes.
  const [days, setDays] = useState(
    template.allDay ? Math.max(1, template.duration) : 1,
  );
  const [hours, setHours] = useState(
    template.allDay ? 1 : Math.floor(template.duration / 60),
  );
  const [minutes, setMinutes] = useState(
    template.allDay ? 0 : template.duration % 60,
  );
  const [attendees, setAttendees] = useState<PersonId[]>(template.attendees);
  const [attachments, setAttachments] = useState<Attachment[]>(
    template.attachments,
  );

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  // Whole days when all-day, else clamped minutes (mirrors the event editor).
  function currentDuration(): number {
    return allDay ? Math.max(1, days) : Math.max(SNAP, hours * 60 + minutes);
  }

  // Drop empty notes / empty checklists so saving doesn't keep stubs around.
  function cleanedAttachments(): Attachment[] {
    return attachments.filter((a) => {
      if (a.kind === "note") return a.text.trim().length > 0;
      if (a.kind === "checklist") return a.items.length > 0;
      return true;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    dispatch({
      type: "updateTemplate",
      template: {
        ...template,
        title: title.trim(),
        allDay,
        duration: currentDuration(),
        attendees,
        attachments: cleanedAttachments(),
      },
    });
    onClose();
  }

  return (
    <form className={shared.editorPage} onSubmit={submit}>
      <header className={shared.editorHead}>
        <button type="button" className={shared.editorCancel} onClick={onClose}>
          Cancel
        </button>
        <strong>Edit template</strong>
        <button type="submit" className={shared.primary}>
          Save
        </button>
      </header>

      <div className={shared.editorBody}>
        <input
          ref={titleRef}
          placeholder="Template name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className={shared.toggle}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All-day
        </label>

        {allDay ? (
          <div className={shared.row}>
            <label className={shared.field}>
              Spans (days)
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) =>
                  setDays(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </label>
          </div>
        ) : (
          <div className={shared.row}>
            <label className={shared.field}>
              Hours
              <input
                type="number"
                min={0}
                value={hours}
                onChange={(e) =>
                  setHours(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
            <label className={shared.field}>
              Minutes
              <input
                type="number"
                min={0}
                max={59}
                step={SNAP}
                value={minutes}
                onChange={(e) =>
                  setMinutes(
                    Math.min(59, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
              />
            </label>
          </div>
        )}

        <label className={shared.label}>Who's involved?</label>
        <AttendeeChips value={attendees} onChange={setAttendees} />

        <AttachmentsEditor attachments={attachments} onChange={setAttachments} />
      </div>
    </form>
  );
}
