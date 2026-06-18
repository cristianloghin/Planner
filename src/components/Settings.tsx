import { useApp } from '../state'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import s from './Settings.module.css'

export function Settings() {
  const { state, dispatch } = useApp()

  return (
    <section className={cx(shared.view, s.settings)}>
      <div className={shared.viewBody}>
      <p className={s.hint}>
        Set up who's who. Names and colours show up across the calendar and tasks.
      </p>
      {Object.values(state.people).map((p) => (
        <div className={s.personRow} key={p.id}>
          <input
            type="color"
            value={p.color}
            onChange={(e) => dispatch({ type: 'recolorPerson', id: p.id, color: e.target.value })}
            aria-label={`Colour for ${p.name}`}
          />
          <input
            type="text"
            value={p.name}
            onChange={(e) => dispatch({ type: 'renamePerson', id: p.id, name: e.target.value })}
            aria-label="Name"
          />
        </div>
      ))}

      <p className={cx(s.hint, s.small)}>
        Everything is stored on this device only for now. Cross-device sync between the two of you
        comes in a later phase.
      </p>
      </div>
    </section>
  )
}
