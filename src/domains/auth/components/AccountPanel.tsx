import { type FormEvent, useState } from "react";
import shared from "../../../assets/styles/shared.module.css";
import { cx } from "../../../assets/utils/cx";

import styles from "./AccountPanel.module.css";

/**
 * Who is signed in, a way to change the password, and the way out. The
 * password form holds its own in-flight and outcome state; what changing it
 * means is the caller's.
 */
export function AccountPanel({
  email,
  onChangePassword,
  onSignOut,
}: {
  email?: string | null;
  onChangePassword: (password: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await onChangePassword(password);
      setStatus({ ok: true, text: "Password updated." });
      setPassword("");
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.AccountPanel}>
      <span className={styles.hint}>Signed in as {email}</span>
      <form className={styles.changePw} onSubmit={submit}>
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
          {busy ? "…" : "Change"}
        </button>
        {status && (
          <span className={cx(styles.status, status.ok ? styles.ok : styles.err)}>
            {status.text}
          </span>
        )}
      </form>
      <button type="button" className={shared.danger} onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
