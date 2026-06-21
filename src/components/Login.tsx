import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import s from "./Login.module.css";

type Mode = "signin" | "signup";

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else {
        const { error, needsConfirmation } = await signUp(email, password);
        if (error) setError(error);
        else if (needsConfirmation)
          setNotice("Check your email to confirm your account, then sign in.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <form className={s.card} onSubmit={onSubmit}>
        <h1 className={s.title}>Planner</h1>
        <p className={s.sub}>
          {mode === "signin" ? "Sign in to your planner" : "Create an account"}
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
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className={s.error}>{error}</p>}
        {notice && <p className={s.notice}>{notice}</p>}

        <button className={s.submit} type="submit" disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        <button
          type="button"
          className={s.switch}
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
