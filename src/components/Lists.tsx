import { useState } from "react";
import { cx } from "../lib/cx";
import { personColor } from "../lib/people";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { PersonId } from "../types";
import s from "./Lists.module.css";

type Assignee = PersonId | "shared";

/** The standalone, undated to-do list — distinct from an event's checklist. */
export function Lists() {
  const { state, dispatch } = useApp();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("shared");

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    dispatch({
      type: "addListItem",
      title: title.trim(),
      personId: assignee === "shared" ? null : assignee,
    });
    setTitle("");
  }

  const open = state.lists.filter((t) => !t.done);
  const done = state.lists.filter((t) => t.done);

  function badge(personId: PersonId | null) {
    if (!personId) return <span className={cx(s.badge, s.shared)}>Shared</span>;
    const p = state.people[personId];
    return (
      <span
        className={s.badge}
        style={{ background: personColor(state, personId) }}
      >
        {p.name}
      </span>
    );
  }

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.viewHeadContainer}>
          <div />
          <div className={shared.weekNav}>
            <strong>Lists</strong>
          </div>
          <div />
        </div>
      </div>

      <div className={shared.viewBody}>
        <div>
          <form className={cx(s.taskAdd)} onSubmit={addItem}>
            <input
              placeholder="Add to a list…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value as Assignee)}
            >
              <option value="shared">Shared</option>
              {Object.values(state.people).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className={shared.primary}>
              Add
            </button>
          </form>
        </div>
        <ul className={s.taskList}>
          {open.map((t) => (
            <li key={t.id} className={s.task}>
              <label>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() =>
                    dispatch({ type: "toggleListItem", id: t.id })
                  }
                />
                <span className={s.taskTitle}>{t.title}</span>
              </label>
              {badge(t.personId)}
              <button
                className={s.taskDel}
                aria-label="Delete item"
                onClick={() => dispatch({ type: "removeListItem", id: t.id })}
              >
                ×
              </button>
            </li>
          ))}
          {open.length === 0 && (
            <p className={shared.empty}>Nothing to do. Nice.</p>
          )}
        </ul>

        {done.length > 0 && (
          <>
            <h3 className={s.doneHead}>Done ({done.length})</h3>
            <ul className={s.taskList}>
              {done.map((t) => (
                <li key={t.id} className={cx(s.task, s.done)}>
                  <label>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() =>
                        dispatch({ type: "toggleListItem", id: t.id })
                      }
                    />
                    <span className={s.taskTitle}>{t.title}</span>
                  </label>
                  {badge(t.personId)}
                  <button
                    className={s.taskDel}
                    aria-label="Delete item"
                    onClick={() =>
                      dispatch({ type: "removeListItem", id: t.id })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
