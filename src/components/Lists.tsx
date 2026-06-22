import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { isoLabel } from "../lib/dates";
import { uid } from "../lib/id";
import { isOverdue } from "../lib/lists";
import { colorVar } from "../lib/palette";
import { personColorKey } from "../lib/people";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { ListItem, PersonId, TodoList } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ListSearch } from "./ListSearch";
import s from "./Lists.module.css";

import { ChevronLeft, Pencil, Plus, X } from "lucide-react";

type Assignee = PersonId | "shared";

type ItemPatch = Partial<
  Pick<ListItem, "title" | "personId" | "groupLabel" | "dueOn">
>;

/**
 * The standalone to-do view, with three modes that never mix:
 *  - index: every list, plus a header "+" to start a new one;
 *  - view: one list's items, checkable but otherwise read-only;
 *  - edit: items become editable (add / delete / change) and so do the list
 *    name and per-item deadlines/assignees.
 *
 * A *new* list is composed as a local {@link draft}: nothing is persisted until
 * Save, and the X discards it (after confirming if anything's been entered).
 * Editing an *existing* list, by contrast, writes through on every change.
 */
export function Lists() {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // The unsaved new list, or null when we're not creating one.
  const [draft, setDraft] = useState<TodoList | null>(null);

  // Add-item form fields (shared by draft-create and live-edit).
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("shared");
  const [group, setGroup] = useState("");
  const [due, setDue] = useState("");

  const [confirmDelete, setConfirmDelete] = useState(false);
  // The item awaiting a delete confirmation (null = no prompt open).
  const [confirmItem, setConfirmItem] = useState<ListItem | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Set when a search result jumps here; scrolls the row in and flashes it.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  const selected = selectedId
    ? (state.lists.find((l) => l.id === selectedId) ?? null)
    : null;
  // The list on screen when we're not on the index: the draft takes precedence.
  const working = draft ?? selected;
  const isDraft = draft !== null;
  const isEditing = isDraft || editing;

  // Committing a draft: create the list, then (once it appears in state) create
  // its items against the new id and open it. The reducer mints the list id, so
  // we can't know it up front — we grab the freshly-appended list here.
  const pendingItems = useRef<ListItem[] | null>(null);
  useEffect(() => {
    if (!pendingItems.current || !state.lists.length) return;
    const created = state.lists[state.lists.length - 1];
    for (const it of pendingItems.current) {
      dispatch({
        type: "addListItem",
        listId: created.id,
        title: it.title,
        personId: it.personId,
        group: it.groupLabel,
        dueOn: it.dueOn,
      });
    }
    pendingItems.current = null;
    setDraft(null);
    setSelectedId(created.id);
    setEditing(false);
  }, [state.lists, dispatch]);

  // Focus the name field when a draft opens (keyed on its id, so typing into it
  // doesn't keep stealing focus back).
  useEffect(() => {
    if (draft) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [draft?.id]);

  // A deleted list (only existing ones can be deleted) drops us to the index.
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

  function resetAddForm() {
    setTitle("");
    setGroup("");
    setDue("");
    setAssignee("shared");
  }

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

  // ---- new-list draft -------------------------------------------------------

  function startDraft() {
    setSelectedId(null);
    setEditing(false);
    resetAddForm();
    setDraft({ id: uid(), title: "", sortOrder: state.lists.length, items: [] });
  }

  // Anything entered that would be lost? Guards the cancel confirmation.
  const draftDirty =
    isDraft &&
    (draft!.title.trim() !== "" ||
      draft!.items.length > 0 ||
      title.trim() !== "");

  function cancelDraft() {
    if (draftDirty) setConfirmCancel(true);
    else discardDraft();
  }

  function discardDraft() {
    setDraft(null);
    setConfirmCancel(false);
    resetAddForm();
  }

  function saveDraft() {
    if (!draft) return;
    pendingItems.current = draft.items;
    dispatch({ type: "addList", title: draft.title.trim() || "New list" });
    resetAddForm();
  }

  // ---- mutations: write to the draft, or through to the store --------------

  function patchTitle(next: string) {
    if (draft) setDraft({ ...draft, title: next });
    else if (selected)
      dispatch({ type: "renameList", id: selected.id, title: next });
  }

  function addWorkingItem(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!working || !text) return;
    const personId = assignee === "shared" ? null : assignee;
    const groupLabel = group.trim() || null;
    const dueOn = due || null;
    if (draft) {
      const item: ListItem = {
        id: uid(),
        title: text,
        done: false,
        personId,
        groupLabel,
        dueOn,
        sortOrder: draft.items.length,
        createdAt: Date.now(),
      };
      setDraft({ ...draft, items: [...draft.items, item] });
    } else if (selected) {
      dispatch({
        type: "addListItem",
        listId: selected.id,
        title: text,
        personId,
        group: groupLabel,
        dueOn,
      });
    }
    setTitle("");
    setDue("");
    // Keep `group` so consecutive adds land in the same section; a deadline,
    // though, is per-item, so it resets.
  }

  function patchItem(item: ListItem, patch: ItemPatch) {
    if (draft) {
      setDraft({
        ...draft,
        items: draft.items.map((i) =>
          i.id === item.id ? { ...i, ...patch } : i,
        ),
      });
      return;
    }
    if (!selected) return;
    if ("dueOn" in patch) {
      dispatch({
        type: "setListItemDue",
        listId: selected.id,
        itemId: item.id,
        dueOn: patch.dueOn ?? null,
      });
      return;
    }
    const merged = { ...item, ...patch };
    dispatch({
      type: "editListItem",
      listId: selected.id,
      itemId: item.id,
      title: merged.title,
      personId: merged.personId,
      group: merged.groupLabel,
    });
  }

  function removeWorkingItem(itemId: string) {
    if (draft)
      setDraft({ ...draft, items: draft.items.filter((i) => i.id !== itemId) });
    else if (selected)
      dispatch({ type: "removeListItem", listId: selected.id, itemId });
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
    if (!working) return null;
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
                  listId: working.id,
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
            onChange={(e) => patchItem(t, { title: e.target.value })}
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
              patchItem(t, { groupLabel: e.target.value.trim() || null })
            }
          />
          <input
            type="date"
            className={cx(s.due, isOverdue(t) && s.overdue)}
            value={t.dueOn ?? ""}
            aria-label="Deadline"
            title={t.dueOn ? `Due ${t.dueOn}` : "Set a deadline"}
            onChange={(e) => patchItem(t, { dueOn: e.target.value || null })}
          />
          <select
            value={t.personId ?? "shared"}
            aria-label="Assignee"
            onChange={(e) =>
              patchItem(t, {
                personId:
                  e.target.value === "shared"
                    ? null
                    : (e.target.value as PersonId),
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

  const open = working ? working.items.filter((t) => !t.done) : [];
  const done = working ? working.items.filter((t) => t.done) : [];

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
  const groupOptions = working
    ? [
        ...new Set(
          working.items
            .map((i) => i.groupLabel)
            .filter((g): g is string => !!g),
        ),
      ]
    : [];

  const row = isEditing ? editRow : viewRow;

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.viewHeadContainer}>
          <div className={shared.headSide}>
            {!working && <ListSearch onPick={jumpToItem} />}
            {working &&
              (isDraft ? (
                <button
                  className={shared.todayBtn}
                  onClick={cancelDraft}
                  aria-label="Cancel new list"
                >
                  <X size={22} />
                </button>
              ) : (
                <button
                  className={shared.todayBtn}
                  onClick={editing ? () => setEditing(false) : backToIndex}
                  aria-label={editing ? "Stop editing" : "Back to lists"}
                >
                  <ChevronLeft size={22} />
                </button>
              ))}
          </div>
          <div className={shared.weekNav}>
            <strong>{working ? working.title || "New list" : "Lists"}</strong>
          </div>
          <div className={shared.headSide}>
            {!working && (
              <button
                className={shared.todayBtn}
                onClick={startDraft}
                aria-label="New list"
              >
                <Plus size={22} />
              </button>
            )}
            {working &&
              (isEditing ? (
                <button
                  className={shared.primary}
                  onClick={isDraft ? saveDraft : () => setEditing(false)}
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
        {!working &&
          (state.lists.length === 0 ? (
            <p className={shared.empty}>No lists yet. Tap + to create one.</p>
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

        {/* ---- A list is open (view or edit, real or draft) ---- */}
        {working && (
          <>
            {isEditing && (
              <>
                <input
                  ref={nameRef}
                  className={s.renameInput}
                  value={working.title}
                  placeholder="List name"
                  aria-label="List name"
                  onChange={(e) => patchTitle(e.target.value)}
                />

                <form className={cx(s.taskAdd)} onSubmit={addWorkingItem}>
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

            {working.items.length === 0 && (
              <p className={shared.empty}>
                {isEditing ? "Add the first item above." : "This list is empty."}
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

            {/* Existing lists can be deleted; a draft is just discarded (X). */}
            {editing && !isDraft && (
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
          if (confirmItem) removeWorkingItem(confirmItem.id);
          setConfirmItem(null);
        }}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Discard this list?"
        message="The list and anything you've added to it won't be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={discardDraft}
      />
    </section>
  );
}
