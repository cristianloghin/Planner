import shared from "../../../assets/styles/shared.module.css";
import { cx } from "../../../assets/utils/cx";

import styles from "./NotificationToggle.module.css";

/** Where this device stands with reminder notifications. */
export type PushStatus = "loading" | "off" | "on" | "denied" | "needs-install" | "unsupported";

/**
 * Per-device reminder notifications: a switch when the browser can, and the
 * reason why not otherwise. Told its state; the route does the asking.
 */
export function NotificationToggle({
  status,
  busy,
  error,
  onToggle,
}: {
  status: PushStatus;
  busy?: boolean;
  error?: string | null;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className={styles.NotificationToggle}>
      <span className={styles.hint}>
        Notifications — get event reminders on this device even when the app is
        closed. Each device is enabled separately.
      </span>

      {status === "needs-install" && (
        <p className={styles.hint}>
          On iPhone and iPad, notifications only work once Planner is installed:
          open the Share menu, choose “Add to Home Screen”, then come back here
          from the installed app.
        </p>
      )}

      {status === "unsupported" && (
        <p className={styles.hint}>This browser doesn't support notifications.</p>
      )}

      {status === "denied" && (
        <p className={styles.hint}>
          Notifications are blocked for Planner. Allow them in your device or
          browser settings, then reopen this screen.
        </p>
      )}

      {(status === "on" || status === "off" || status === "loading") && (
        <label className={shared.toggle}>
          <input
            type="checkbox"
            checked={status === "on"}
            disabled={busy || status === "loading"}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Reminder notifications on this device
        </label>
      )}

      {error && <p className={cx(styles.hint, styles.error)}>{error}</p>}
    </div>
  );
}
