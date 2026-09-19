import { COLOR_OPTIONS, type ColorKey } from '../../../assets/palette'
import { Button } from '../../../assets/ui/Button'
import { ColorPicker } from '../../../assets/ui/ColorPicker'
import { CommitTextInput } from '../../../assets/ui/CommitTextInput'
import type { Person, PersonId } from '../types'

import styles from './PeopleSettings.module.css'

/**
 * Everyone in the account, each with a name to edit and the colour this user
 * sees them in. Names are shared; colours are the user's own, so a row whose
 * colour is overridden offers a way back to the shared one.
 */
export function PeopleSettings({
  people,
  onRename,
  onRecolor,
  onResetColor,
}: {
  people: { person: Person; color: ColorKey; overridden: boolean }[]
  onRename: (id: PersonId, name: string) => void
  onRecolor: (id: PersonId, color: ColorKey) => void
  onResetColor: (id: PersonId) => void
}) {
  return (
    <div className={styles.PeopleSettings}>
      <p className={styles.hint}>
        Set up who's who. Names are shared with your partner; colours are yours — pick how each
        person looks on your own calendar.
      </p>
      {people.map(({ person, color, overridden }) => (
        <div className={styles.row} key={person.id}>
          <ColorPicker
            options={COLOR_OPTIONS}
            value={color}
            ariaLabel={`Your colour for ${person.name}`}
            onChange={(next) => next && onRecolor(person.id, next)}
          />
          <div className={styles.name}>
            <CommitTextInput
              type="text"
              value={person.name}
              onCommit={(name) => onRename(person.id, name)}
              aria-label="Name"
            />
            {overridden && (
              <Button onClick={() => onResetColor(person.id)} label="Reset to the default colour">
                Reset
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
