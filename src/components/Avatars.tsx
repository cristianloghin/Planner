import { colorStyle } from '../assets/palette'
import { useAuth } from '../auth'
import { usePeople } from '../domains/people/queries'
import { personColorKey } from '../domains/people/selectors'
import { usePreferences } from '../domains/preferences/queries'
import { personColors } from '../domains/preferences/selectors'
import type { PersonId } from '../types'
import s from './Avatars.module.css'

/** A row of small round initials, one per attendee, in each person's color. */
export function Avatars({ attendees }: { attendees: PersonId[] }) {
  const { accountId, session } = useAuth()
  const { data: people = [] } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, session?.user.id ?? null, personColors)
  if (attendees.length === 0) return null
  return (
    <span className={s.avatars}>
      {attendees.map((id) => {
        const p = people.find((x) => x.id === id)
        // A person not in the list yet (first fetch in flight, or one a
        // partner just removed) must not crash the view.
        if (!p) return null
        return (
          <span
            key={id}
            className={s.avatar}
            style={colorStyle(personColorKey(people, overrides, id))}
            title={p.name}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        )
      })}
    </span>
  )
}
