import { DAY_MIN } from '../lib/timelineLayout'
import s from './TimeGutter.module.css'

const GUTTER_HOURS = Array.from({ length: 25 }, (_, h) => h)

/** The hour-label column shared by the timeline views (Day, Week grid). */
export function TimeGutter({ hourH }: { hourH: number }) {
  return (
    <div className={s.timeGutter} style={{ height: DAY_MIN * (hourH / 60) }}>
      {GUTTER_HOURS.map((h) => (
        <div key={h} className={s.gutterLabel} style={{ top: h * hourH }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}
