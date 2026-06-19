import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { minutesToTime, toDateTimeLocal } from "../lib/dates";
import { uid } from "../lib/id";
import { REMINDER_OFFSETS, offsetLabel } from "../lib/notifications";
import { eventDate, eventStartMinutes } from "../lib/timing";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type {
  Attachment,
  CalendarEvent,
  ChecklistEntry,
  PersonId,
  RecurrenceFreq,
} from "../types";
import { AttendeeChips } from "./AttendeeChips";
import s from "./EventEditor.module.css";

const SNAP = 15;

/** What the editor opens onto: a brand-new event or an existing one. */
export type EditorTarget =
  | {
      mode: "new";
      date: string;
      attendees: PersonId[];
      allDay?: boolean;
      startMin?: number;
      endMin?: number;
    }
  | { mode: "edit"; event: CalendarEvent };

type RepeatChoice = "none" | RecurrenceFreq;

/** datetime-local value for a date + minutes-from-midnight. */
function dtLocal(date: string, minute: number): string {
  return `${date}T${minutesToTime(minute)}`;
}

/** Whole minutes between two datetime-local strings (b - a). */
function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/** Shared full-page editor for the event *template* (timing, attendees, attachments, deps). */
export function EventEditor({
  target,
  onClose,
}: {
  target: EditorTarget;
  onClose: () => void;
}) {
  const { dispatch, beginEdit, endEdit } = useApp();
  const isEdit = target.mode === "edit";
  const base = isEdit ? target.event : null;

  // While this editor is open, defer realtime reloads so a partner's change
  // can't pull data out from under the unsaved draft.
  useEffect(() => {
    beginEdit();
    return endEdit;
  }, [beginEdit, endEdit]);

  const [title, setTitle] = useState(base?.title ?? "");
  const [allDay, setAllDay] = useState(
    base?.allDay ?? (isEdit ? false : (target.allDay ?? false)),
  );

  const initialDate = isEdit ? eventDate(base!) : target.date;
  const initialStartMin = isEdit
    ? eventStartMinutes(base!)
    : ((target.mode === "new" ? target.startMin : undefined) ?? 9 * 60);
  const initialEndMin =
    (target.mode === "new" ? target.endMin : undefined) ??
    Math.min(initialStartMin + 60, 24 * 60);

  const [date, setDate] = useState(initialDate);
  const [days, setDays] = useState(
    isEdit && base!.allDay ? Math.max(1, base!.duration) : 1,
  );
  const [startDT, setStartDT] = useState(
    isEdit && !base!.allDay
      ? base!.start
      : dtLocal(initialDate, initialStartMin),
  );
  const [endDT, setEndDT] = useState(() => {
    if (isEdit && !base!.allDay) {
      const d = new Date(base!.start);
      d.setMinutes(d.getMinutes() + base!.duration);
      return toDateTimeLocal(d);
    }
    return dtLocal(initialDate, initialEndMin);
  });

  const [attendees, setAttendees] = useState<PersonId[]>(
    isEdit ? base!.attendees : target.attendees,
  );
  const [repeat, setRepeat] = useState<RepeatChoice>(
    base?.recurrence?.freq ?? "none",
  );
  const [interval, setInterval] = useState(base?.recurrence?.interval ?? 1);
  const [attachments, setAttachments] = useState<Attachment[]>(
    base?.attachments ?? [],
  );

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const reminderSet = new Set(
    attachments
      .filter((a) => a.kind === "reminder")
      .map((a) => (a as { offset: number }).offset),
  );

  function toggleReminder(offset: number) {
    setAttachments((prev) =>
      reminderSet.has(offset)
        ? prev.filter((a) => !(a.kind === "reminder" && a.offset === offset))
        : [...prev, { id: uid(), kind: "reminder", offset }],
    );
  }

  function addNote() {
    setAttachments((prev) => [...prev, { id: uid(), kind: "note", text: "" }]);
  }
  function addChecklist() {
    setAttachments((prev) => [
      ...prev,
      { id: uid(), kind: "checklist", items: [] },
    ]);
  }
  function updateAttachment(id: string, patch: Partial<Attachment>) {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Attachment) : a)),
    );
  }
  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    let start: string;
    let duration: number;
    if (allDay) {
      start = date;
      duration = Math.max(1, days);
    } else {
      start = startDT;
      duration = Math.max(SNAP, minutesBetween(startDT, endDT));
    }

    // Drop empty notes / empty checklists so saving doesn't keep stubs around.
    const cleaned = attachments.filter((a) => {
      if (a.kind === "note") return a.text.trim().length > 0;
      if (a.kind === "checklist") return a.items.length > 0;
      return true;
    });

    const event: Omit<CalendarEvent, "id"> = {
      title: title.trim(),
      start,
      allDay,
      duration,
      recurrence:
        repeat === "none"
          ? undefined
          : { freq: repeat, interval: Math.max(1, interval) },
      attendees,
      attachments: cleaned,
    };

    if (isEdit)
      dispatch({ type: "updateEvent", event: { ...event, id: base!.id } });
    else dispatch({ type: "addEvent", event });
    onClose();
  }

  const unitLabel =
    repeat === "daily" ? "days" : repeat === "weekly" ? "weeks" : "months";

  return (
    <form className={shared.editorPage} onSubmit={submit}>
      <header className={shared.editorHead}>
        <button type="button" className={shared.editorCancel} onClick={onClose}>
          Cancel
        </button>
        <strong>{isEdit ? "Edit event" : "New event"}</strong>
        <button type="submit" className={shared.primary}>
          Save
        </button>
      </header>

      <div className={shared.editorBody}>
        <input
          ref={titleRef}
          placeholder="What's the plan?"
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
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
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
              Starts
              <input
                type="datetime-local"
                step={SNAP * 60}
                value={startDT}
                onChange={(e) => {
                  const next = e.target.value;
                  // Keep the same duration when the start moves.
                  const dur = Math.max(SNAP, minutesBetween(startDT, endDT));
                  const ne = new Date(next);
                  ne.setMinutes(ne.getMinutes() + dur);
                  setStartDT(next);
                  setEndDT(toDateTimeLocal(ne));
                }}
              />
            </label>
            <label className={shared.field}>
              Ends
              <input
                type="datetime-local"
                step={SNAP * 60}
                value={endDT}
                onChange={(e) => setEndDT(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className={shared.row}>
          <label className={shared.field}>
            Repeats
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatChoice)}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {repeat !== "none" && (
            <label className={shared.field}>
              Every
              <div className={shared.interval}>
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) =>
                    setInterval(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <span>{unitLabel}</span>
              </div>
            </label>
          )}
        </div>

        <label className={shared.label}>Who's involved?</label>
        <AttendeeChips value={attendees} onChange={setAttendees} />

        <label className={shared.label}>Remind me</label>
        <div className={shared.chips}>
          {REMINDER_OFFSETS.map((o) => {
            const on = reminderSet.has(o);
            return (
              <button
                type="button"
                key={o}
                className={cx(shared.chip, on && shared.on)}
                style={
                  on
                    ? {
                        background: "var(--accent)",
                        borderColor: "var(--accent)",
                      }
                    : undefined
                }
                onClick={() => toggleReminder(o)}
              >
                {offsetLabel(o)}
              </button>
            );
          })}
        </div>

        <div className={s.attachments}>
          {attachments
            .filter((a) => a.kind !== "reminder")
            .map((a) =>
              a.kind === "note" ? (
                <NoteEditor
                  key={a.id}
                  text={a.text}
                  onChange={(text) => updateAttachment(a.id, { text })}
                  onRemove={() => removeAttachment(a.id)}
                />
              ) : (
                <ChecklistEditor
                  key={a.id}
                  title={a.title ?? ""}
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
            <button
              type="button"
              className={s.addAttachment}
              onClick={addChecklist}
            >
              + Checklist
            </button>
          </div>
        </div>

        {isEdit && (
          <button
            type="button"
            className={cx(shared.danger, shared.editorDelete)}
            onClick={() => {
              dispatch({ type: "removeEvent", id: base!.id });
              onClose();
            }}
          >
            Delete event
          </button>
        )}
      </div>
    </form>
  );
}

function NoteEditor({
  text,
  onChange,
  onRemove,
}: {
  text: string;
  onChange: (text: string) => void;
  onRemove: () => void;
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
  );
}

function ChecklistEditor({
  title,
  items,
  onChange,
  onRemove,
}: {
  title: string;
  items: ChecklistEntry[];
  onChange: (patch: { title?: string; items?: ChecklistEntry[] }) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");

  function addEntry() {
    if (!draft.trim()) return;
    onChange({ items: [...items, { id: uid(), title: draft.trim() }] });
    setDraft("");
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
              onClick={() =>
                onChange({ items: items.filter((x) => x.id !== it.id) })
              }
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
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <button type="button" onClick={addEntry}>
          Add
        </button>
      </div>
    </div>
  );
}
