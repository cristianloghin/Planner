import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { cx } from "../lib/cx";
import {
  checklistEntries,
  notes,
  reminderOffsets,
} from "../lib/attachments";
import { attendeeLabel, personColorKey } from "../lib/people";
import { COLOR_KEYS, colorVar } from "../lib/palette";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { EventTemplate } from "../types";
import { ColorPicker } from "./ColorPicker";
import { TemplateEditor } from "./TemplateEditor";
import s from "./Settings.module.css";

const COLOR_OPTIONS = COLOR_KEYS.map((key, i) => ({
  value: key,
  color: colorVar(key),
  label: `Colour ${i + 1}`,
}));

export function Settings() {
  const { state, dispatch } = useApp();
  const { session, signOut } = useAuth();

  return (
    <section className={cx(shared.view, s.settings)}>
      <div className={shared.viewHead}>
        <div className={shared.viewHeadContainer}>
          <div />
          <div className={shared.weekNav}>
            <strong>Settings</strong>
          </div>
          <div />
        </div>
      </div>
      <div className={shared.viewBody}>
        <p className={s.hint}>
          Set up who's who. Names are shared with your partner; colours are
          yours — pick how each person looks on your own calendar.
        </p>
        {Object.values(state.people).map((p) => {
          const overridden = state.preferences.personColors[p.id] !== undefined;
          const activeKey = personColorKey(state, p.id);
          return (
            <div className={s.personRow} key={p.id}>
              <div className={s.personHead}>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) =>
                    dispatch({
                      type: "renamePerson",
                      id: p.id,
                      name: e.target.value,
                    })
                  }
                  aria-label="Name"
                />
                {overridden && (
                  <button
                    type="button"
                    className={s.resetColor}
                    onClick={() =>
                      dispatch({ type: "clearColorPref", personId: p.id })
                    }
                    title="Reset to the default colour"
                  >
                    Reset
                  </button>
                )}
              </div>
              <ColorPicker
                options={COLOR_OPTIONS}
                value={activeKey}
                ariaLabel={`Your colour for ${p.name}`}
                onChange={(color) =>
                  color &&
                  dispatch({
                    type: "setColorPref",
                    personId: p.id,
                    color,
                  })
                }
              />
            </div>
          );
        })}

        <TemplatesSection />

        {session && (
          <div className={s.account}>
            <span className={cx(s.hint, s.small)}>
              Signed in as {session.user.email}
            </span>
            <ChangePassword />
            <button
              type="button"
              className={shared.danger}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Manage saved event templates (DATA_MODEL Decision 10). Templates are *created*
 * from the event editor ("Save as template"); here you review, edit and delete
 * them. Clicking a row opens the full-page {@link TemplateEditor}.
 */
function TemplatesSection() {
  const { state, dispatch } = useApp();
  const templates = state.templates;
  const [editing, setEditing] = useState<EventTemplate | null>(null);

  return (
    <div className={s.templates}>
      <span className={cx(s.hint, s.small)}>
        Event templates — reusable blueprints. Pick one when creating an event to
        prefill its people, checklists, notes and reminders. Save a new one from
        the event editor, or tap one here to edit it.
      </span>
      {templates.length === 0 ? (
        <p className={s.templatesEmpty}>No templates yet.</p>
      ) : (
        templates.map((t) => {
          const bits: string[] = [];
          if (t.attendees.length)
            bits.push(attendeeLabel(state, t.attendees));
          const checks = checklistEntries(t).length;
          if (checks) bits.push(`${checks} checklist item${checks > 1 ? "s" : ""}`);
          const noteCount = notes(t).length;
          if (noteCount) bits.push(`${noteCount} note${noteCount > 1 ? "s" : ""}`);
          const reminders = reminderOffsets(t).length;
          if (reminders) bits.push(`${reminders} reminder${reminders > 1 ? "s" : ""}`);
          return (
            <div className={s.templateRow} key={t.id}>
              <button
                type="button"
                className={s.templateInfo}
                onClick={() => setEditing(t)}
                aria-label={`Edit template ${t.title || "Untitled"}`}
              >
                <strong>{t.title || "Untitled template"}</strong>
                {bits.length > 0 && (
                  <span className={s.templateMeta}>{bits.join(" · ")}</span>
                )}
              </button>
              <button
                type="button"
                className={s.resetColor}
                onClick={() => dispatch({ type: "removeTemplate", id: t.id })}
                aria-label={`Delete template ${t.title || "Untitled"}`}
              >
                Delete
              </button>
            </div>
          );
        })
      )}
      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Set a new password for the signed-in user (no email round-trip needed). */
function ChangePassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) setStatus({ ok: false, text: error });
    else {
      setStatus({ ok: true, text: "Password updated." });
      setPassword("");
    }
  }

  return (
    <form className={s.changePw} onSubmit={onSubmit}>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        minLength={6}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        type="submit"
        className={shared.primary}
        disabled={busy || password.length < 6}
      >
        {busy ? "…" : "Change"}
      </button>
      {status && (
        <span className={cx(s.pwStatus, status.ok ? s.pwOk : s.pwErr)}>
          {status.text}
        </span>
      )}
    </form>
  );
}
