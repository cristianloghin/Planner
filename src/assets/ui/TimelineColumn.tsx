import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cx } from "../utils/cx";
import styles from "./TimelineColumn.module.css";

const DAY_MIN = 24 * 60;

/**
 * One day-long column of a timeline: hour and quarter-hour lines, an optional
 * "now" line, and a tap on empty space that reports the minute under the
 * finger. What sits on it is the caller's — absolutely positioned children.
 */
export function TimelineColumn({
  pxPerMin,
  nowMin,
  highlight,
  onAddAt,
  children,
}: {
  pxPerMin: number;
  /** Minute of the day to draw the "now" line at; unset draws none. */
  nowMin?: number;
  /** Tint the column (today's, in a week). */
  highlight?: boolean;
  onAddAt?: (minute: number) => void;
  children?: ReactNode;
}) {
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (!onAddAt) return;
    // A tap on something placed in the column is that thing's, not ours.
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onAddAt((e.clientY - rect.top) / pxPerMin);
  }

  const hourH = pxPerMin * 60;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-on-empty-space is a pointer affordance to prefill the editor; the keyboard path is the header's + button
    <div
      className={cx(styles.TimelineColumn, highlight && styles.highlight)}
      style={
        {
          height: DAY_MIN * pxPerMin,
          "--hour-h": `${hourH}px`,
          "--quarter-h": `${hourH / 4}px`,
        } as CSSProperties
      }
      onClick={handleClick}
    >
      {nowMin != null && (
        <div className={styles.nowLine} style={{ top: nowMin * pxPerMin }}>
          <span className={styles.nowDot} />
        </div>
      )}
      {children}
    </div>
  );
}
