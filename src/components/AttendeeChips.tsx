import { useApp } from '../state'
import type { PersonId } from '../types'
import { peopleList, personColor } from '../lib/people'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'

/** Toggle chips for choosing who's on an event. Always keeps at least one. */
export function AttendeeChips({
  value,
  onChange,
}: {
  value: PersonId[]
  onChange: (next: PersonId[]) => void
}) {
  const { state } = useApp()

  function toggle(id: PersonId) {
    const has = value.includes(id)
    let next = has ? value.filter((x) => x !== id) : [...value, id]
    if (next.length === 0) next = [id]
    onChange(next)
  }

  return (
    <div className={shared.chips}>
      {peopleList(state).map((p) => {
        const on = value.includes(p.id)
        const c = personColor(state, p.id)
        return (
          <button
            type="button"
            key={p.id}
            className={cx(shared.chip, on && shared.on)}
            style={on ? { background: c, borderColor: c } : { borderColor: c, color: c }}
            onClick={() => toggle(p.id)}
          >
            {p.name}
          </button>
        )
      })}
    </div>
  )
}
