import { useApp } from '../state'
import type { MemberRole } from '../types'
import { active } from '../lib/sync'

const NEW_COLORS = ['#f59e0b', '#0ea5e9', '#a855f7', '#10b981', '#ef4444', '#6366f1']

export function Settings() {
  const { state, dispatch } = useApp()
  const members = active(state.members)

  function addMember() {
    const color = NEW_COLORS[members.length % NEW_COLORS.length]
    dispatch({ type: 'addMember', member: { name: 'New member', color, role: 'adult' } })
  }

  return (
    <section className="settings view">
      <div className="view-body">
        <label className="field">
          Household
          <input
            type="text"
            value={state.household.name}
            onChange={(e) => dispatch({ type: 'renameHousehold', name: e.target.value })}
            aria-label="Household name"
          />
        </label>

        <p className="hint">
          Add the people you're planning around. Roles drive coverage: a child on their own with no
          free adult is flagged on the Day view.
        </p>

        {members.map((m) => (
          <div className="person-row" key={m.id}>
            <input
              type="color"
              value={m.color}
              onChange={(e) => dispatch({ type: 'updateMember', member: { ...m, color: e.target.value } })}
              aria-label={`Colour for ${m.name}`}
            />
            <input
              type="text"
              value={m.name}
              onChange={(e) => dispatch({ type: 'updateMember', member: { ...m, name: e.target.value } })}
              aria-label="Name"
            />
            <select
              value={m.role}
              onChange={(e) =>
                dispatch({ type: 'updateMember', member: { ...m, role: e.target.value as MemberRole } })
              }
              aria-label="Role"
            >
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
            <button
              className="person-del"
              aria-label={`Remove ${m.name}`}
              onClick={() => dispatch({ type: 'removeMember', id: m.id })}
              disabled={members.length <= 1}
            >
              ×
            </button>
          </div>
        ))}

        <button className="add-link" onClick={addMember}>
          + Add member
        </button>

        <p className="hint small">
          Everything is stored on this device only for now. Cross-device sync between the household
          comes in a later phase.
        </p>
      </div>
    </section>
  )
}
