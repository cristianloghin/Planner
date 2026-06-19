import { useState, type FormEvent } from 'react'
import { useApp } from '../state'
import { useAuth } from '../auth'
import { personColor } from '../lib/people'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import s from './Settings.module.css'

export function Settings() {
  const { state, dispatch } = useApp()
  const { session, signOut } = useAuth()

  return (
    <section className={cx(shared.view, s.settings)}>
      <div className={shared.viewBody}>
      <p className={s.hint}>
        Set up who's who. Names are shared with your partner; colours are yours —
        pick how each person looks on your own calendar.
      </p>
      {Object.values(state.people).map((p) => {
        const overridden = state.preferences.personColors[p.id] !== undefined
        return (
          <div className={s.personRow} key={p.id}>
            <input
              type="color"
              value={personColor(state, p.id)}
              onChange={(e) => dispatch({ type: 'setColorPref', personId: p.id, color: e.target.value })}
              aria-label={`Your colour for ${p.name}`}
            />
            <input
              type="text"
              value={p.name}
              onChange={(e) => dispatch({ type: 'renamePerson', id: p.id, name: e.target.value })}
              aria-label="Name"
            />
            {overridden && (
              <button
                type="button"
                className={s.resetColor}
                onClick={() => dispatch({ type: 'clearColorPref', personId: p.id })}
                title="Reset to the default colour"
              >
                Reset
              </button>
            )}
          </div>
        )
      })}

      <p className={cx(s.hint, s.small)}>
        Calendar data is still stored on this device for now. Cross-device sync between the two of
        you is being wired up.
      </p>

      {session && (
        <div className={s.account}>
          <span className={cx(s.hint, s.small)}>Signed in as {session.user.email}</span>
          <ChangePassword />
          <button type="button" className={shared.danger} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
      </div>
    </section>
  )
}

/** Set a new password for the signed-in user (no email round-trip needed). */
function ChangePassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) setStatus({ ok: false, text: error })
    else {
      setStatus({ ok: true, text: 'Password updated.' })
      setPassword('')
    }
  }

  return (
    <form className={s.changePw} onSubmit={onSubmit}>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        minLength={6}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className={shared.primary} disabled={busy || password.length < 6}>
        {busy ? '…' : 'Change'}
      </button>
      {status && (
        <span className={cx(s.pwStatus, status.ok ? s.pwOk : s.pwErr)}>{status.text}</span>
      )}
    </form>
  )
}
