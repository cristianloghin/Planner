import type { CSSProperties, ReactNode } from "react";
import { type ColorKey, colorStyle } from "../../../assets/palette";
import { cx } from "../../../assets/utils/cx";
import { minutesToTime } from "../../../assets/utils/dates";
import type { DayOccurrence } from "../../../services/recurrence";
import { Badges } from "./Badges";

import styles from "./EventBlock.module.css";

// A dense bar needs this many pixels before its title renders at all.
const TITLE_MIN_PX = 18;

/**
 * One timed occurrence as a block on a timeline. Where it sits is the
 * caller's layout (`style`); its colour is resolved by the caller, because an
 * event with no colour of its own shows in its lane's.
 *
 * `dense` is the week's look: title only, and only when the bar is tall
 * enough to fit one. Children (attendee avatars) render after the title.
 */
export function EventBlock({
  occ,
  color,
  style,
  dense,
  showTitle = true,
  onClick,
  children,
}: {
  occ: DayOccurrence;
  color: ColorKey;
  style: CSSProperties & { height: number };
  dense?: boolean;
  showTitle?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  const { event } = occ;
  const { start, end } = occ.segment;
  const range = `${minutesToTime(start)}–${minutesToTime(end)}`;
  return (
    <button
      type="button"
      className={cx(styles.EventBlock, dense && styles.dense)}
      style={{ ...style, ...colorStyle(color) }}
      onClick={onClick}
      title={dense ? event.title : undefined}
      aria-label={dense ? `${event.title}, ${range}` : undefined}
    >
      {!dense && (
        <span className={styles.time}>
          {range}
          {occ.moved && (
            <span className={styles.tag} aria-label="Moved from another day">
              {" "}
              ↔ moved
            </span>
          )}
          <Badges event={event} />
        </span>
      )}
      {showTitle && (!dense || style.height >= TITLE_MIN_PX) && (
        <span className={styles.title}>{event.title}</span>
      )}
      {children}
    </button>
  );
}
