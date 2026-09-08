import { type FormEvent, useState } from 'react'
import { useAccount } from '../account'
import { COLOR_OPTIONS } from '../assets/palette'
import shared from '../assets/styles/shared.module.css'
import { ColorPicker } from '../assets/ui/ColorPicker'
import { CommitTextInput } from '../assets/ui/CommitTextInput'
import { cx } from '../assets/utils/cx'
import { useSignOut, useUpdatePassword } from '../domains/auth/mutations'
import { usePeopleWrite } from '../domains/people/mutations'
import { usePeople } from '../domains/people/queries'
import { personColorKey } from '../domains/people/selectors'
import { usePreferencesWrite } from '../domains/preferences/mutations'
import { withPersonColor, withWeekLayout, withoutPersonColor } from '../domains/preferences/patches'
import { usePreferences } from '../domains/preferences/queries'
import { weekLayout } from '../domains/preferences/selectors'
import type { Preferences } from '../types'
import { NotificationSettings } from './NotificationSettings'
import s from './Settings.module.css'

const WEEK_LAYOUTS = [
  { value: 'list', label: 'List' },
  { value: 'timeline', label: 'Timeline' },
] as const

export function Settings() {
  const { accountId, userId, email } = useAccount()
  const signOut = useSignOut()
  const { data: people = [] } = usePeople(accountId)
  const { data: prefs } = usePreferences(accountId, userId)
  const overrides = prefs?.personColors ?? {}
  const peopleWrite = usePeopleWrite()
  const prefsWrite = usePreferencesWrite()
  // Settings save as one document, so a change is the current document with
  // that one thing changed. Nothing to save against until the first read lands.
  const savePrefs = (next: Preferences) =>
    prefsWrite.mutate({ accountId: accountId, userId: userId as string, prefs: next })

  return (
    <section className={cx(s.view, s.settings)}>
      <div className={s.viewHead}>
        <div className={s.viewHeadContainer}>
          <div />
          <div className={s.nav}>
            <strong>Settings</strong>
          </div>
          <div />
        </div>
      </div>
      <div className={s.viewBody}>
        <p className={s.hint}>
          Set up who's who. Names are shared with your partner; colours are yours — pick how each
          person looks on your own calendar.
        </p>
        {people.map((p) => {
          const overridden = overrides[p.id] !== undefined
          const activeKey = personColorKey(people, overrides, p.id)
          return (
            <div className={s.personRow} key={p.id}>
              <ColorPicker
                options={COLOR_OPTIONS}
                value={activeKey}
                ariaLabel={`Your colour for ${p.name}`}
                onChange={(color) =>
                  color && prefs && savePrefs(withPersonColor(prefs, p.id, color))
                }
              />
              <div className={s.personHead}>
                <CommitTextInput
                  type="text"
                  value={p.name}
                  onCommit={(name) =>
                    peopleWrite.mutate({
                      accountId: accountId,
                      change: { kind: 'rename', id: p.id, name },
                    })
                  }
                  aria-label="Name"
                />
                {overridden && (
                  <button
                    type="button"
                    className={s.resetColor}
                    onClick={() => prefs && savePrefs(withoutPersonColor(prefs, p.id))}
                    title="Reset to the default colour"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <WeekLayoutSection />


        <NotificationSettings />

        <div className={s.account}>
          <span className={cx(s.hint, s.small)}>Signed in as {email}</span>
          <ChangePassword />
          <button type="button" className={shared.danger} onClick={() => signOut.mutate()}>
            Sign out
          </button>
        </div>
      </div>
    </section>
  )
}

/** Pick how the Week tab lays out the seven days: day-card list or hourly grid. */
function WeekLayoutSection() {
  const { accountId, userId } = useAccount()
  const { data: prefs } = usePreferences(accountId, userId)
  const prefsWrite = usePreferencesWrite()
  const active = prefs ? weekLayout(prefs) : 'list'
  return (
    <div className={s.weekLayout}>
      <span className={cx(s.hint, s.small)}>
        Week view layout — List stacks each day's events as cards; Timeline shows the week on an
        hourly grid with a time gutter, swipe navigation and pinch-to-zoom.
      </span>
      <div className={s.segmented} role="radiogroup" aria-label="Week view layout">
        {WEEK_LAYOUTS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active === opt.value}
            className={cx(s.segment, active === opt.value && s.segmentOn)}
            onClick={() =>
              prefs &&
              prefsWrite.mutate({
                accountId: accountId,
                userId: userId as string,
                prefs: withWeekLayout(prefs, opt.value),
              })
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Set a new password for the signed-in user (no email round-trip needed). */
function ChangePassword() {
  const updatePassword = useUpdatePassword()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await updatePassword.mutateAsync({ password })
      setStatus({ ok: true, text: 'Password updated.' })
      setPassword('')
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
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
