import { colorVar } from '../assets/palette'
import shared from '../assets/styles/shared.module.css'
import { cx } from '../assets/utils/cx'
import { useAuth } from '../auth'
import { usePeople } from '../domains/people/queries'
import { personColorKey } from '../domains/people/selectors'
import { usePreferences } from '../domains/preferences/queries'
import { personColors } from '../domains/preferences/selectors'
import type { PersonId } from '../types'

/** Toggle chips for choosing who's on an event. Always keeps at least one. */
export function AttendeeChips({
  value,
  onChange,
}: {
  value: PersonId[]
  onChange: (next: PersonId[]) => void
}) {
  const { accountId, session } = useAuth()
  // Already in lane order: the client reads people sorted.
  const { data: people = [] } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, session?.user.id ?? null, personColors)

  function toggle(id: PersonId) {
    const has = value.includes(id)
    let next = has ? value.filter((x) => x !== id) : [...value, id]
    if (next.length === 0) next = [id]
    onChange(next)
  }

  return (
    <div className={shared.chips}>
      {people.map((p) => {
        const on = value.includes(p.id)
        const c = colorVar(personColorKey(people, overrides, p.id))
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
