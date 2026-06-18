import { useState } from 'react'
import { useApp } from '../state'
import { eventColor } from '../lib/people'
import { occurrencesOnDate } from '../lib/recurrence'
import { eventStartMinutes } from '../lib/timing'
import {
  DAY_NAMES,
  addMonths,
  isSameMonth,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from '../lib/dates'
import { cx } from '../lib/cx'
import shared from '../styles/shared.module.css'
import s from './MonthView.module.css'

// Up to this many event dots before collapsing the rest into a "+N".
const MAX_DOTS = 4

export function MonthView({ onOpenDay }: { onOpenDay: (iso: string) => void }) {
  const { state } = useApp()
  const [cursor, setCursor] = useState(() => startOfMonth(toISODate(new Date())))
  const today = toISODate(new Date())
  const days = monthGridDays(cursor)

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.weekNav}>
          <button onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
            ‹
          </button>
          <strong>{monthLabel(cursor)}</strong>
          <button onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className={shared.viewBody}>
        <div className={s.monthGrid}>
        {DAY_NAMES.map((name) => (
          <div key={name} className={s.monthWeekday}>
            {name}
          </div>
        ))}

        {days.map((iso) => {
          // Expand recurring/multi-day events onto this concrete date.
          const dayEvents = occurrencesOnDate(state.events, iso)
            .map((o) => o.event)
            .sort(
              (a, b) =>
                Number(b.allDay) - Number(a.allDay) || eventStartMinutes(a) - eventStartMinutes(b),
            )
          return (
            <button
              key={iso}
              className={cx(
                s.monthCell,
                !isSameMonth(iso, cursor) && s.dim,
                iso === today && s.today,
              )}
              onClick={() => onOpenDay(iso)}
              aria-label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${dayEvents.length} plans`}
            >
              <span className={s.monthDate}>{Number(iso.slice(8, 10))}</span>
              {dayEvents.length > 0 && (
                <span className={s.monthDots}>
                  {dayEvents.slice(0, MAX_DOTS).map((e) => (
                    <span
                      key={e.id}
                      className={s.monthDot}
                      style={{ background: eventColor(state, e.attendees) }}
                    />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className={s.monthMore}>+{dayEvents.length - MAX_DOTS}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>
    </section>
  )
}
