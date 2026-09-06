import type { ReactNode } from "react";
import { cx } from "../utils/cx";
import styles from "./DayHead.module.css";

/**
 * A weekday's column heading: the day name over its number, today ringed in
 * accent, with whatever the caller drops underneath (all-day chips). Tapping
 * the label expands that column, or restores equal columns if it already is.
 */
export function DayHead({
  name,
  number,
  isToday,
  isExpanded,
  onToggle,
  children,
}: {
  name: string;
  number: number;
  isToday?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={cx(styles.DayHead, isToday && styles.today)}>
      <button
        type="button"
        className={styles.label}
        onClick={onToggle}
        aria-pressed={isExpanded}
        aria-label={
          isExpanded ? "Restore equal day columns" : `Expand ${name}'s column`
        }
      >
        <span className={styles.name}>{name}</span>
        <span className={styles.number}>{number}</span>
      </button>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}
