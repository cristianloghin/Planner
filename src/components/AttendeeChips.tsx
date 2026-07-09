import { cx } from '../lib/cx'
import { colorVar } from '../lib/palette'
import { peopleList, personColorKey } from '../lib/people'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type { PersonId } from '../types'

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
        const c = colorVar(personColorKey(state, p.id))
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
