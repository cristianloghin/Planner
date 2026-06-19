import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { personColor } from "../lib/people";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { ListItem, PersonId } from "../types";
import s from "./Lists.module.css";

type Assignee = PersonId | "shared";

/** The standalone to-do view — named lists, each holding undated to-dos. */
export function Lists() {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("shared");
  const [newListName, setNewListName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // After creating a list, jump to it (the reducer appends it last).
  const jumpToLast = useRef(false);
  useEffect(() => {
    if (jumpToLast.current && state.lists.length) {
      setSelectedId(state.lists[state.lists.length - 1].id);
      jumpToLast.current = false;
    }
  }, [state.lists]);

  // Fall back to the first list when nothing valid is selected (e.g. after a
  // delete, or on first load).
  const selected =
    state.lists.find((l) => l.id === selectedId) ?? state.lists[0] ?? null;

  function createList(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    jumpToLast.current = true;
    dispatch({ type: "addList", title: name });
    setNewListName("");
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !title.trim()) return;
    dispatch({
      type: "addListItem",
      listId: selected.id,
      title: title.trim(),
      personId: assignee === "shared" ? null : assignee,
    });
    setTitle("");
  }

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

  function row(t: ListItem) {
    if (!selected) return null;
    return (
      <li key={t.id} className={cx(s.task, t.done && s.done)}>
        <label>
          <input
            type="checkbox"
            checked={t.done}
            onChange={() =>
              dispatch({ type: "toggleListItem", listId: selected.id, itemId: t.id })
            }
          />
          <span className={s.taskTitle}>{t.title}</span>
        </label>
        {badge(t.personId)}
        <button
          className={s.taskDel}
          aria-label="Delete item"
          onClick={() =>
            dispatch({ type: "removeListItem", listId: selected.id, itemId: t.id })
          }
        >
          ×
        </button>
      </li>
    );
  }

  const open = selected ? selected.items.filter((t) => !t.done) : [];
  const done = selected ? selected.items.filter((t) => t.done) : [];

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
        {/* List switcher */}
        <div className={s.listTabs}>
          {state.lists.map((l) => (
            <button
              key={l.id}
              className={cx(s.listTab, l.id === selected?.id && s.active)}
              onClick={() => {
                setSelectedId(l.id);
                setRenaming(false);
              }}
            >
              {l.title}
            </button>
          ))}
        </div>

        {/* New-list form */}
        <form className={s.newList} onSubmit={createList}>
          <input
            placeholder="New list…"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
          <button type="submit" className={s.smallBtn}>
            Add list
          </button>
        </form>

        {!selected && (
          <p className={shared.empty}>No lists yet. Create one to get started.</p>
        )}

        {selected && (
          <>
            {/* Active-list header: rename / delete */}
            <div className={s.listHeader}>
              {renaming ? (
                <form
                  className={s.renameForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const next = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim();
                    if (next) dispatch({ type: "renameList", id: selected.id, title: next });
                    setRenaming(false);
                  }}
                >
                  <input name="name" defaultValue={selected.title} autoFocus />
                  <button type="submit" className={s.smallBtn}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={s.smallBtn}
                    onClick={() => setRenaming(false)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h2 className={s.listTitle}>{selected.title}</h2>
                  <button
                    className={s.smallBtn}
                    onClick={() => setRenaming(true)}
                    aria-label="Rename list"
                  >
                    Rename
                  </button>
                  <button
                    className={cx(s.smallBtn, s.deleteList)}
                    aria-label="Delete list"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete “${selected.title}” and its ${selected.items.length} item(s)?`,
                        )
                      )
                        dispatch({ type: "removeList", id: selected.id });
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>

            <form className={cx(s.taskAdd)} onSubmit={addItem}>
              <input
                placeholder="Add to this list…"
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

            <ul className={s.taskList}>
              {open.map(row)}
              {open.length === 0 && (
                <p className={shared.empty}>Nothing to do. Nice.</p>
              )}
            </ul>

            {done.length > 0 && (
              <>
                <h3 className={s.doneHead}>Done ({done.length})</h3>
                <ul className={s.taskList}>{done.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
