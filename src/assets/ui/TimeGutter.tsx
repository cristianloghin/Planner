import styles from './TimeGutter.module.css'

const HOURS = Array.from({ length: 25 }, (_, h) => h)

/** The hour-label column beside a timeline. */
export function TimeGutter({ hourH }: { hourH: number }) {
  return (
    <div className={styles.TimeGutter} style={{ height: 24 * hourH }}>
      {HOURS.map((h) => (
        <div key={h} className={styles.label} style={{ top: h * hourH }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}
