import { type FormEvent, useState } from 'react'
import { useSignIn, useSignUp } from '../domains/auth/mutations'
import s from './Login.module.css'

type Mode = 'signin' | 'signup'

export function Login() {
  const signIn = useSignIn()
  const signUp = useSignUp()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        await signIn.mutateAsync({ email, password })
      } else {
        const { needsConfirmation } = await signUp.mutateAsync({ email, password })
        if (needsConfirmation) setNotice('Check your email to confirm your account, then sign in.')
      }
    } catch (e) {
      // A refused sign-in arrives as an error with the reason as its message.
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.page}>
      <form className={s.card} onSubmit={onSubmit}>
        <h1 className={s.title}>Planner</h1>
        <p className={s.sub}>
          {mode === 'signin' ? 'Sign in to your planner' : 'Create an account'}
        </p>

        <label className={s.field}>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className={s.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className={s.error}>{error}</p>}
        {notice && <p className={s.notice}>{notice}</p>}

        <button className={s.submit} type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className={s.switch}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
