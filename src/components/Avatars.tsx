import { colorStyle } from '../lib/palette'
import { personColorKey } from '../lib/people'
import { useApp } from '../state'
import type { PersonId } from '../types'
import s from './Avatars.module.css'

/** A row of small round initials, one per attendee, in each person's color. */
export function Avatars({ attendees }: { attendees: PersonId[] }) {
  const { state } = useApp()
  if (attendees.length === 0) return null
  return (
    <span className={s.avatars}>
      {attendees.map((id) => {
        const p = state.people[id]
        // A person missing from the local snapshot (mid-reload, or one a
        // partner just removed) must not crash the view.
        if (!p) return null
        return (
          <span
            key={id}
            className={s.avatar}
            style={colorStyle(personColorKey(state, id))}
            title={p.name}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        )
      })}
    </span>
  )
}
