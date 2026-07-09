import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import {
  currentSubscription,
  disablePush,
  enablePush,
  notificationPermission,
  pushConfigured,
  pushSupport,
} from "../lib/push";
import { cx } from "../lib/cx";
import shared from "../styles/shared.module.css";
import s from "./Settings.module.css";

type Status =
  | "loading"
  | "off"
  | "on"
  | "denied"
  | "needs-install"
  | "unsupported";

/**
 * Per-device Web Push registration. Each device (this browser / this phone)
 * opts in separately; the row it writes is what the reminder sender (next
 * phase) will deliver to. Hidden entirely when the deployment has no VAPID
 * key configured.
 */
export function NotificationSettings() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushConfigured) return;
    void (async () => {
      const support = pushSupport();
      if (support !== "ok") {
        setStatus(support);
        return;
      }
      if (notificationPermission() === "denied") {
        setStatus("denied");
        return;
      }
      setStatus((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  if (!pushConfigured) return null;

  async function toggle(next: boolean) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (next) {
        const result = await enablePush(session.user.id);
        setStatus(result === "subscribed" ? "on" : "denied");
      } else {
        await disablePush();
        setStatus("off");
      }
    } catch (e) {
      console.error("Push toggle failed:", e);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.account}>
      <span className={cx(s.hint, s.small)}>
        Notifications — get event reminders on this device even when the app
        is closed. Each device is enabled separately.
      </span>

      {status === "needs-install" && (
        <p className={cx(s.hint, s.small)}>
          On iPhone and iPad, notifications only work once Planner is
          installed: open the Share menu, choose “Add to Home Screen”, then
          come back here from the installed app.
        </p>
      )}

      {status === "unsupported" && (
        <p className={cx(s.hint, s.small)}>
          This browser doesn&apos;t support notifications.
        </p>
      )}

      {status === "denied" && (
        <p className={cx(s.hint, s.small)}>
          Notifications are blocked for Planner. Allow them in your device or
          browser settings, then reopen this screen.
        </p>
      )}

      {(status === "on" || status === "off" || status === "loading") && (
        <label className={shared.toggle}>
          <input
            type="checkbox"
            checked={status === "on"}
            disabled={busy || status === "loading" || !session}
            onChange={(e) => void toggle(e.target.checked)}
          />
          Reminder notifications on this device
        </label>
      )}

      {error && <p className={cx(s.hint, s.small, s.pwErr)}>{error}</p>}
    </div>
  );
}
