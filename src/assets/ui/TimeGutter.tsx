import styles from './TimeGutter.module.css'

const HOURS = Array.from({ length: 25 }, (_, h) => h)

/**
 * The hour-label column beside a timeline. Given `nowMin`, it marks the
 * current time with a dot on its edge with the timeline — the axis is the
 * gutter's, so "now" on the axis is too; the line across the day is the
 * timeline's. The gutter sits outside the deck's clip, which is why the dot
 * can straddle the edge without being cut.
 */
export function TimeGutter({ hourH, nowMin }: { hourH: number; nowMin?: number }) {
  return (
    <div className={styles.TimeGutter} style={{ height: 24 * hourH }}>
      {HOURS.map((h) => (
        <div key={h} className={styles.label} style={{ top: h * hourH }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
      {nowMin != null && <div className={styles.nowDot} style={{ top: (nowMin / 60) * hourH }} />}
    </div>
  )
}
