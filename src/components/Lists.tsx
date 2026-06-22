import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { isoLabel } from "../lib/dates";
import { isOverdue } from "../lib/lists";
import { colorVar } from "../lib/palette";
import { personColorKey } from "../lib/people";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { ListItem, PersonId } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ListSearch } from "./ListSearch";
import s from "./Lists.module.css";

import { ChevronLeft, Pencil, Plus, X } from "lucide-react";

type Assignee = PersonId | "shared";

/**
 * The standalone to-do view. Three distinct modes, never mixed:
 *  - index: every list, plus a header "+" that creates one and drops straight
 *    into editing it (no list open otherwise);
 *  - view: one list's items, checkable but otherwise read-only;
 *  - edit: that list's items become editable (add / delete / change) and the
 *    list name and deadlines/assignees can be changed.
 */
export function Lists() {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("shared");
  const [group, setGroup] = useState("");
  const [due, setDue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The item awaiting a delete confirmation (null = no prompt open).
  const [confirmItem, setConfirmItem] = useState<ListItem | null>(null);
  // Set when a search result jumps here; scrolls the row in and flashes it.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // After "+" creates a list, open it straight into edit mode (the reducer
  // appends it last) and focus its name field so it's ready to be typed over.
  const openLast = useRef(false);
  const justCreated = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (openLast.current && state.lists.length) {
      setSelectedId(state.lists[state.lists.length - 1].id);
      setEditing(true);
      openLast.current = false;
    }
  }, [state.lists]);

  useEffect(() => {
    if (editing && justCreated.current) {
      nameRef.current?.focus();
      nameRef.current?.select();
      justCreated.current = false;
    }
  }, [editing]);

  // The open list, if its id still resolves. Unlike before, an unknown/cleared
  // id means the index (no implicit "first list") — selecting is explicit now.
  const selected = selectedId
    ? (state.lists.find((l) => l.id === selectedId) ?? null)
    : null;

  // A deleted list drops us back to the index.
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
      setEditing(false);
    }
  }, [selectedId, selected]);

  // Scroll the highlighted row into view (once it's rendered) and clear the
  // flash after a moment.
  useEffect(() => {
    if (!highlightId) return;
    document
      .getElementById(`list-item-${highlightId}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightId]);

  function openList(id: string) {
    setSelectedId(id);
    setEditing(false);
  }

  function backToIndex() {
    setSelectedId(null);
    setEditing(false);
  }

  // A search hit lands on its list in (read-only) view mode, highlighted.
  function jumpToItem(listId: string, itemId: string) {
    setSelectedId(listId);
    setEditing(false);
    setHighlightId(itemId);
  }

  // Create a list and jump straight into editing it — the name starts as a
  // placeholder the focus effect selects, so the first keystroke renames it.
  function createList() {
    openLast.current = true;
    justCreated.current = true;
    dispatch({ type: "addList", title: "New list" });
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !title.trim()) return;
    dispatch({
      type: "addListItem",
      listId: selected.id,
      title: title.trim(),
      personId: assignee === "shared" ? null : assignee,
      group: group.trim() || null,
      dueOn: due || null,
    });
    setTitle("");
    setDue("");
    // Keep `group` so consecutive adds land in the same section; a deadline,
    // though, is per-item, so it resets.
  }

  function badge(personId: PersonId | null) {
    if (!personId) return <span className={cx(s.badge, s.shared)}>Shared</span>;
    const p = state.people[personId];
    return (
      <span
        className={s.badge}
        style={
          {
            "--c": colorVar(personColorKey(state, personId)),
          } as React.CSSProperties
        }
      >
        {p.name}
      </span>
    );
  }

  // Read-only row (view mode): tick it, but nothing else.
  function viewRow(t: ListItem) {
    if (!selected) return null;
    return (
      <li
        key={t.id}
        id={`list-item-${t.id}`}
        className={cx(
          s.task,
          t.done && s.done,
          highlightId === t.id && s.highlight,
        )}
      >
        <div className={s.taskInput}>
          <label>
            <input
              type="checkbox"
              checked={t.done}
              onChange={() =>
                dispatch({
                  type: "toggleListItem",
                  listId: selected.id,
                  itemId: t.id,
                })
              }
            />
            <span className={s.taskTitle}>{t.title}</span>
          </label>
        </div>
        <div className={s.dueContainer}>
          {t.dueOn && (
            <span className={cx(s.dueLabel, isOverdue(t) && s.overdue)}>
              Due {isoLabel(t.dueOn)}
            </span>
          )}
          {badge(t.personId)}
        </div>
      </li>
    );
  }

  // Editable row (edit mode): change every field, or delete the item.
  function editRow(t: ListItem) {
    if (!selected) return null;
    return (
      <li
        key={t.id}
        id={`list-item-${t.id}`}
        className={cx(s.task, highlightId === t.id && s.highlight)}
      >
        <div className={s.taskInput}>
          <input
            className={s.editTitle}
            value={t.title}
            aria-label="Item text"
            onChange={(e) =>
              dispatch({
                type: "editListItem",
                listId: selected.id,
                itemId: t.id,
                title: e.target.value,
                personId: t.personId,
                group: t.groupLabel,
              })
            }
          />
          <button
            className={s.taskDel}
            aria-label="Delete item"
            onClick={() => setConfirmItem(t)}
          >
            <X size={20} />
          </button>
        </div>
        <div className={s.editFields}>
          <input
            className={s.groupInput}
            placeholder="Group"
            list="list-group-options"
            value={t.groupLabel ?? ""}
            aria-label="Group"
            onChange={(e) =>
              dispatch({
                type: "editListItem",
                listId: selected.id,
                itemId: t.id,
                title: t.title,
                personId: t.personId,
                group: e.target.value.trim() || null,
              })
            }
          />
          <input
            type="date"
            className={cx(s.due, isOverdue(t) && s.overdue)}
            value={t.dueOn ?? ""}
            aria-label="Deadline"
            title={t.dueOn ? `Due ${t.dueOn}` : "Set a deadline"}
            onChange={(e) =>
              dispatch({
                type: "setListItemDue",
                listId: selected.id,
                itemId: t.id,
                dueOn: e.target.value || null,
              })
            }
          />
          <select
            value={t.personId ?? "shared"}
            aria-label="Assignee"
            onChange={(e) =>
              dispatch({
                type: "editListItem",
                listId: selected.id,
                itemId: t.id,
                title: t.title,
                personId:
                  e.target.value === "shared"
                    ? null
                    : (e.target.value as PersonId),
                group: t.groupLabel,
              })
            }
          >
            <option value="shared">Shared</option>
            {Object.values(state.people).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </li>
    );
  }

  const open = selected ? selected.items.filter((t) => !t.done) : [];
  const done = selected ? selected.items.filter((t) => t.done) : [];

  // Group open items by their header. Ungrouped (key "") renders first with no
  // header; labelled groups follow in first-appearance order.
  const openGroups: [string, ListItem[]][] = (() => {
    const m = new Map<string, ListItem[]>();
    for (const t of open) {
      const key = t.groupLabel ?? "";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === "" ? -1 : b[0] === "" ? 1 : 0,
    );
  })();

  // Distinct existing headers in this list, for the add/edit forms' suggestions.
  const groupOptions = selected
    ? [
        ...new Set(
          selected.items
            .map((i) => i.groupLabel)
            .filter((g): g is string => !!g),
        ),
      ]
    : [];

  const row = editing ? editRow : viewRow;

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.viewHeadContainer}>
          <div className={shared.headSide}>
            {selected ? (
              <button
                className={shared.todayBtn}
                onClick={editing ? () => setEditing(false) : backToIndex}
                aria-label={editing ? "Stop editing" : "Back to lists"}
              >
                <ChevronLeft size={22} />
              </button>
            ) : (
              <ListSearch onPick={jumpToItem} />
            )}
          </div>
          <div className={shared.weekNav}>
            <strong>{selected ? selected.title : "Lists"}</strong>
          </div>
          <div className={shared.headSide}>
            {!selected && (
              <button
                className={shared.todayBtn}
                onClick={createList}
                aria-label="New list"
              >
                <Plus size={22} />
              </button>
            )}
            {selected &&
              (editing ? (
                <button
                  className={shared.primary}
                  onClick={() => setEditing(false)}
                >
                  Save
                </button>
              ) : (
                <button
                  className={shared.todayBtn}
                  onClick={() => setEditing(true)}
                  aria-label="Edit list"
                >
                  <Pencil size={20} />
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className={shared.viewBody}>
        {/* ---- Index: every list (create via the header "+") ---- */}
        {!selected &&
          (state.lists.length === 0 ? (
            <p className={shared.empty}>
              No lists yet. Tap + to create one.
            </p>
          ) : (
            <ul className={s.listIndex}>
              {state.lists.map((l) => {
                const remaining = l.items.filter((i) => !i.done).length;
                return (
                  <li key={l.id}>
                    <button
                      className={s.listIndexRow}
                      onClick={() => openList(l.id)}
                    >
                      <span className={s.listIndexName}>{l.title}</span>
                      <span className={s.listIndexCount}>
                        {remaining
                          ? `${remaining} to do`
                          : l.items.length
                            ? "All done"
                            : "Empty"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {/* ---- A list is open (view or edit) ---- */}
        {selected && (
          <>
            {editing && (
              <>
                <input
                  ref={nameRef}
                  className={s.renameInput}
                  value={selected.title}
                  aria-label="List name"
                  onChange={(e) =>
                    dispatch({
                      type: "renameList",
                      id: selected.id,
                      title: e.target.value,
                    })
                  }
                />

                <form className={cx(s.taskAdd)} onSubmit={addItem}>
                  <input
                    placeholder="Add to this list…"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <input
                    className={s.groupInput}
                    placeholder="Group (optional)"
                    list="list-group-options"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  />
                  <div className={s.taskAddDueContainer}>
                    <input
                      type="date"
                      className={s.dueInput}
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      aria-label="Deadline (optional)"
                      title="Deadline (optional)"
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
                  </div>
                  <button type="submit" className={shared.primary}>
                    Add
                  </button>
                </form>
              </>
            )}

            <datalist id="list-group-options">
              {groupOptions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>

            {selected.items.length === 0 && (
              <p className={shared.empty}>
                {editing ? "Add the first item above." : "This list is empty."}
              </p>
            )}

            {openGroups.map(([label, items]) => (
              <div key={label || "__ungrouped"}>
                {label && <h3 className={s.groupHead}>{label}</h3>}
                <ul className={s.taskList}>{items.map(row)}</ul>
              </div>
            ))}

            {done.length > 0 && (
              <>
                <h3 className={s.doneHead}>Done ({done.length})</h3>
                <ul className={s.taskList}>{done.map(row)}</ul>
              </>
            )}

            {editing && (
              <button
                className={cx(s.smallBtn, s.deleteList)}
                aria-label="Delete list"
                onClick={() => setConfirmDelete(true)}
              >
                Delete list
              </button>
            )}
          </>
        )}
      </div>

      {selected && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete “${selected.title}”?`}
          message={`This removes the list and its ${selected.items.length} item(s).`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            dispatch({ type: "removeList", id: selected.id });
            backToIndex();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmItem(null);
        }}
        title="Delete this item?"
        message={
          confirmItem ? `“${confirmItem.title}” will be removed.` : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (selected && confirmItem)
            dispatch({
              type: "removeListItem",
              listId: selected.id,
              itemId: confirmItem.id,
            });
          setConfirmItem(null);
        }}
      />
    </section>
  );
}
