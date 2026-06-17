import { useApp } from '../state'

export function Settings() {
  const { state, dispatch } = useApp()

  return (
    <section className="settings view">
      <div className="view-body">
      <p className="hint">
        Set up who's who. Names and colours show up across the calendar and tasks.
      </p>
      {Object.values(state.people).map((p) => (
        <div className="person-row" key={p.id}>
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

      <p className="hint small">
        Everything is stored on this device only for now. Cross-device sync between the two of you
        comes in a later phase.
      </p>
      </div>
    </section>
  )
}
