import { useApp } from '../state'
import type { MemberId } from '../types'
import { active } from '../lib/sync'

/** Toggle chips for choosing who's on an event. Always keeps at least one. */
export function AttendeeChips({
  value,
  onChange,
}: {
  value: MemberId[]
  onChange: (next: MemberId[]) => void
}) {
  const { state } = useApp()
  const members = active(state.members)

  function toggle(id: MemberId) {
    const has = value.includes(id)
    let next = has ? value.filter((x) => x !== id) : [...value, id]
    if (next.length === 0) next = [id]
    onChange(next)
  }

  return (
    <div className="chips">
      {members.map((p) => {
        const on = value.includes(p.id)
        return (
          <button
            type="button"
            key={p.id}
            className={on ? 'chip on' : 'chip'}
            style={on ? { background: p.color, borderColor: p.color } : { borderColor: p.color, color: p.color }}
            onClick={() => toggle(p.id)}
          >
            {p.name}
          </button>
        )
      })}
    </div>
  )
}
