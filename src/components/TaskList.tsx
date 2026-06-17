import { useState } from 'react'
import { useApp } from '../state'
import type { PersonId } from '../types'

type Assignee = PersonId | 'shared'

export function TaskList() {
  const { state, dispatch } = useApp()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState<Assignee>('shared')

  function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    dispatch({
      type: 'addTask',
      title: title.trim(),
      personId: assignee === 'shared' ? null : assignee,
    })
    setTitle('')
  }

  const open = state.tasks.filter((t) => !t.done)
  const done = state.tasks.filter((t) => t.done)

  function badge(personId: PersonId | null) {
    if (!personId) return <span className="badge shared">Shared</span>
    const p = state.people[personId]
    return (
      <span className="badge" style={{ background: p.color }}>
        {p.name}
      </span>
    )
  }

  return (
    <section className="tasks view">
      <form className="task-add view-head" onSubmit={addTask}>
        <input
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value as Assignee)}>
          <option value="shared">Shared</option>
          {Object.values(state.people).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="primary">
          Add
        </button>
      </form>

      <div className="view-body">
      <ul className="task-list">
        {open.map((t) => (
          <li key={t.id} className="task">
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => dispatch({ type: 'toggleTask', id: t.id })}
              />
              <span className="task-title">{t.title}</span>
            </label>
            {badge(t.personId)}
            <button
              className="task-del"
              aria-label="Delete task"
              onClick={() => dispatch({ type: 'removeTask', id: t.id })}
            >
              ×
            </button>
          </li>
        ))}
        {open.length === 0 && <p className="empty">Nothing to do. Nice.</p>}
      </ul>

      {done.length > 0 && (
        <>
          <h3 className="done-head">Done ({done.length})</h3>
          <ul className="task-list">
            {done.map((t) => (
              <li key={t.id} className="task done">
                <label>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => dispatch({ type: 'toggleTask', id: t.id })}
                  />
                  <span className="task-title">{t.title}</span>
                </label>
                {badge(t.personId)}
                <button
                  className="task-del"
                  aria-label="Delete task"
                  onClick={() => dispatch({ type: 'removeTask', id: t.id })}
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
  )
}
